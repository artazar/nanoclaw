import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  ASSISTANT_NAME: 'TestBot',
  SCHEDULER_POLL_INTERVAL: 60_000,
  TIMEZONE: 'UTC',
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
  DATA_DIR: '/tmp/nanoclaw-test-data',
}));

vi.mock('./container-runner.js', () => ({
  runContainerAgent: vi.fn(),
  writeTasksSnapshot: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: { ...actual, mkdirSync: vi.fn() },
    mkdirSync: vi.fn(),
  };
});

import { runContainerAgent } from './container-runner.js';
import { _initTestDatabase, createTask, getTaskById } from './db.js';
import {
  _resetSchedulerLoopForTests,
  computeNextRun,
  startSchedulerLoop,
} from './task-scheduler.js';

describe('task scheduler', () => {
  beforeEach(() => {
    _initTestDatabase();
    _resetSchedulerLoopForTests();
    vi.useFakeTimers();
    vi.mocked(runContainerAgent).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a failed once-task with backoff instead of dropping it, then notifies the user after exhausting retries', async () => {
    vi.mocked(runContainerAgent).mockResolvedValue({
      status: 'error',
      result: null,
      error: 'boom',
    });

    createTask({
      id: 'retry-test',
      group_folder: 'test-group',
      chat_jid: 'chat@g.us',
      prompt: 'remind me',
      schedule_type: 'once',
      schedule_value: '2026-01-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 1000).toISOString(),
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    const enqueueTask = vi.fn(
      (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );
    const sendMessage = vi.fn(async () => {});

    startSchedulerLoop({
      registeredGroups: () => ({
        'chat@g.us': {
          folder: 'test-group',
          name: 'Test',
          isMain: false,
        } as any,
      }),
      getSessions: () => ({}),
      queue: {
        enqueueTask,
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage,
    });

    // First attempt fails immediately (task was already due).
    await vi.advanceTimersByTimeAsync(10);
    let task = getTaskById('retry-test');
    expect(task?.status).toBe('active');
    expect(task?.retry_count).toBe(1);
    expect(sendMessage).not.toHaveBeenCalled();

    // Backoff schedule is 1m, 2m, 4m — advance well past all of them plus
    // the poll interval so every retry (and the final give-up) fires.
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    task = getTaskById('retry-test');
    // 1 initial attempt + 3 retries (MAX_TASK_RETRIES) before giving up.
    expect(runContainerAgent).toHaveBeenCalledTimes(4);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      'chat@g.us',
      expect.stringContaining('Reminder failed'),
    );
    expect(task?.status).toBe('completed');
    expect(task?.retry_count).toBe(0);
  });

  it('pauses due tasks with invalid group folders to prevent retry churn', async () => {
    createTask({
      id: 'task-invalid-folder',
      group_folder: '../../outside',
      chat_jid: 'bad@g.us',
      prompt: 'run',
      schedule_type: 'once',
      schedule_value: '2026-02-22T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-02-22T00:00:00.000Z',
    });

    const enqueueTask = vi.fn(
      (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );

    startSchedulerLoop({
      registeredGroups: () => ({}),
      getSessions: () => ({}),
      queue: { enqueueTask } as any,
      onProcess: () => {},
      sendMessage: async () => {},
    });

    await vi.advanceTimersByTimeAsync(10);

    const task = getTaskById('task-invalid-folder');
    expect(task?.status).toBe('paused');
  });

  it('computeNextRun anchors interval tasks to scheduled time to prevent drift', () => {
    const scheduledTime = new Date(Date.now() - 2000).toISOString(); // 2s ago
    const task = {
      id: 'drift-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: '60000', // 1 minute
      context_mode: 'isolated' as const,
      next_run: scheduledTime,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();

    // Should be anchored to scheduledTime + 60s, NOT Date.now() + 60s
    const expected = new Date(scheduledTime).getTime() + 60000;
    expect(new Date(nextRun!).getTime()).toBe(expected);
  });

  it('computeNextRun returns null for once-tasks', () => {
    const task = {
      id: 'once-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'once' as const,
      schedule_value: '2026-01-01T00:00:00.000Z',
      context_mode: 'isolated' as const,
      next_run: new Date(Date.now() - 1000).toISOString(),
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    expect(computeNextRun(task)).toBeNull();
  });

  it('computeNextRun skips missed intervals without infinite loop', () => {
    // Task was due 10 intervals ago (missed)
    const ms = 60000;
    const missedBy = ms * 10;
    const scheduledTime = new Date(Date.now() - missedBy).toISOString();

    const task = {
      id: 'skip-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: String(ms),
      context_mode: 'isolated' as const,
      next_run: scheduledTime,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();
    // Must be in the future
    expect(new Date(nextRun!).getTime()).toBeGreaterThan(Date.now());
    // Must be aligned to the original schedule grid
    const offset =
      (new Date(nextRun!).getTime() - new Date(scheduledTime).getTime()) % ms;
    expect(offset).toBe(0);
  });
});
