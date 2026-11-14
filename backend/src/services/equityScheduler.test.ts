import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  isSendDue,
  loadEquitySchedulerConfig,
  startEquityScheduler,
  stopEquityScheduler,
  INITIAL_POLL_DELAY_MS,
  INITIAL_RELEASE_DELAY_MS,
  SEND_CHECK_INTERVAL_MS,
  type EquitySchedulerDeps,
  type EquitySchedulerTimers,
} from './equityScheduler';
import type { EquityBatchCycleResult } from './equitySftpService';
import type { EquityResponsePollResult } from './equityResponseService';

// EAT = UTC+3, no DST. 2026-11-12 is a Thursday.
const eat = (date: string, hhmm: string): Date => new Date(`${date}T${hhmm}:00+03:00`);
const THU = '2026-11-12';
const FRI = '2026-11-13';
const SAT = '2026-11-14';
const SUN = '2026-11-15';

const BOTH_ON: NodeJS.ProcessEnv = {
  EQUITY_AUTO_SEND_ENABLED: 'true',
  EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true',
  EQUITY_RESPONSE_POLL_ENABLED: 'true',
};

const OK_SEND: EquityBatchCycleResult = {
  status: 'ok',
  unrecorded: 0,
  batches: 1,
  rows: 3,
  totalAmount: 90000,
  uploaded: 1,
  failed: 0,
  uncertain: 0,
  skipped: 0,
  deferred: 0,
};

const OK_POLL: EquityResponsePollResult = {
  status: 'ok',
  filesSeen: 2,
  filesNew: 1,
  filesProcessed: 1,
  duplicates: 0,
  success: 5,
  failed: 0,
  needsReview: 0,
  unmatched: 0,
  errors: 0,
};

type FakeTimer = { id: number; kind: 'timeout' | 'interval'; fn: () => unknown; ms: number; cleared: boolean };

function fakeTimers() {
  const timers: FakeTimer[] = [];
  const api: EquitySchedulerTimers = {
    setTimeout: (fn, ms) => {
      const t: FakeTimer = { id: timers.length, kind: 'timeout', fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: (h) => {
      (h as FakeTimer).cleared = true;
    },
    setInterval: (fn, ms) => {
      const t: FakeTimer = { id: timers.length, kind: 'interval', fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearInterval: (h) => {
      (h as FakeTimer).cleared = true;
    },
  };
  return { timers, api };
}

type Harness = {
  clock: { now: Date };
  sendCalls: number;
  releaseCalls: number;
  pollCalls: number;
  logs: string[];
  errors: string[];
  timers: FakeTimer[];
  sendTick: () => Promise<void>;
  releaseTick: () => Promise<void>;
  pollTick: () => Promise<void>;
  stop: () => void;
};

function start(
  env: NodeJS.ProcessEnv,
  at: Date,
  overrides: Partial<EquitySchedulerDeps> = {}
): Harness {
  stopEquityScheduler();
  const { timers, api } = fakeTimers();
  const h: Harness = {
    clock: { now: at },
    sendCalls: 0,
    releaseCalls: 0,
    pollCalls: 0,
    logs: [],
    errors: [],
    timers,
    sendTick: async () => {},
    releaseTick: async () => {},
    pollTick: async () => {},
    stop: () => {},
  };
  const handle = startEquityScheduler({
    env,
    now: () => h.clock.now,
    timers: api,
    log: (l) => h.logs.push(l),
    logError: (l) => h.errors.push(l),
    runSend: async () => {
      h.sendCalls += 1;
      return OK_SEND;
    },
    runRelease: async () => {
      h.releaseCalls += 1;
      return OK_SEND;
    },
    runPoll: async () => {
      h.pollCalls += 1;
      return OK_POLL;
    },
    ...overrides,
  });
  if (handle) {
    h.sendTick = handle.sendTick;
    h.releaseTick = handle.releaseTick;
    h.pollTick = handle.pollTick;
    h.stop = handle.stop;
  }
  return h;
}

afterEach(() => stopEquityScheduler());

/** Daily payments job (and the release job): both switches on, poll off. */
const SEND_ONLY: NodeJS.ProcessEnv = {
  EQUITY_AUTO_SEND_ENABLED: 'true',
  EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true',
};
/** Release job only: the old payments route stays off. */
const RELEASE_ONLY: NodeJS.ProcessEnv = { EQUITY_AUTO_SEND_ENABLED: 'true' };

// ---------------------------------------------------------------------------
// Send job
// ---------------------------------------------------------------------------

test('send: does not run before the send time, runs at it', async () => {
  const h = start(SEND_ONLY, eat(THU, '08:59'));
  await h.sendTick();
  assert.equal(h.sendCalls, 0);
  h.clock.now = eat(THU, '09:00');
  await h.sendTick();
  assert.equal(h.sendCalls, 1);
  assert.match(h.logs.join('\n'), /\[equity-scheduler\] send status=ok batches=1 rows=3 uploaded=1/);
});

test('send: the once-a-minute timer drives the run', async () => {
  const h = start(SEND_ONLY, eat(THU, '09:00'));
  const interval = h.timers.find((t) => t.kind === 'interval' && t.ms === SEND_CHECK_INTERVAL_MS);
  assert.ok(interval);
  await interval.fn();
  assert.equal(h.sendCalls, 1);
  assert.equal(h.releaseCalls, 0);
});

test('send: uses EAT, not UTC (06:00 UTC is 09:00 EAT)', async () => {
  const h = start(SEND_ONLY, new Date(`${THU}T05:59:00Z`));
  await h.sendTick();
  assert.equal(h.sendCalls, 0);
  h.clock.now = new Date(`${THU}T06:00:00Z`);
  await h.sendTick();
  assert.equal(h.sendCalls, 1);
});

test('send: not on a day that is not selected', async () => {
  const h = start(SEND_ONLY, eat(SAT, '09:30'));
  await h.sendTick();
  h.clock.now = eat(SUN, '09:30');
  await h.sendTick();
  assert.equal(h.sendCalls, 0);

  const custom = start({ ...SEND_ONLY, EQUITY_AUTO_SEND_DAYS: '6' }, eat(SAT, '09:30'));
  await custom.sendTick();
  assert.equal(custom.sendCalls, 1);
  custom.clock.now = eat(FRI, '09:30');
  await custom.sendTick();
  assert.equal(custom.sendCalls, 1);
});

test('send: not twice on the same EAT date, runs again the next selected day', async () => {
  const h = start(SEND_ONLY, eat(THU, '09:00'));
  await h.sendTick();
  h.clock.now = eat(THU, '09:01');
  await h.sendTick();
  h.clock.now = eat(THU, '10:30');
  await h.sendTick();
  assert.equal(h.sendCalls, 1);
  h.clock.now = eat(FRI, '09:00');
  await h.sendTick();
  assert.equal(h.sendCalls, 2);
});

test('send: catch-up run inside the window after a late start', async () => {
  const h = start(SEND_ONLY, eat(THU, '12:59'));
  await h.sendTick();
  assert.equal(h.sendCalls, 1);
});

test('send: no run outside the window (default 4h, and a custom window)', async () => {
  const h = start(SEND_ONLY, eat(THU, '13:00'));
  await h.sendTick();
  h.clock.now = eat(THU, '18:00');
  await h.sendTick();
  assert.equal(h.sendCalls, 0);

  const short = start({ ...SEND_ONLY, EQUITY_AUTO_SEND_WINDOW_HOURS: '1' }, eat(THU, '10:00'));
  await short.sendTick();
  assert.equal(short.sendCalls, 0);
  short.clock.now = eat(THU, '09:59');
  await short.sendTick();
  assert.equal(short.sendCalls, 1);
});

test('send: custom send time and days are honoured', async () => {
  const env = { ...SEND_ONLY, EQUITY_AUTO_SEND_TIME_EAT: '14:30', EQUITY_AUTO_SEND_DAYS: '4, 5' };
  const h = start(env, eat(THU, '14:29'));
  await h.sendTick();
  assert.equal(h.sendCalls, 0);
  h.clock.now = eat(THU, '14:30');
  await h.sendTick();
  assert.equal(h.sendCalls, 1);
});

test('send: an overlapping run is skipped', async () => {
  let release: () => void = () => {};
  let calls = 0;
  const h = start(SEND_ONLY, eat(THU, '09:00'), {
    runSend: () => {
      calls += 1;
      return new Promise<EquityBatchCycleResult>((resolve) => {
        release = () => resolve(OK_SEND);
      });
    },
  });
  const first = h.sendTick();
  await h.sendTick(); // marker already set for today, so not due; still must not start a second run
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(calls, 1);
});

test('send: in-flight guard skips a due run while one is still running', async () => {
  let release: () => void = () => {};
  let calls = 0;
  const h = start(SEND_ONLY, eat(THU, '09:00'), {
    runSend: () => {
      calls += 1;
      if (calls > 1) return Promise.resolve(OK_SEND);
      return new Promise<EquityBatchCycleResult>((resolve) => {
        release = () => resolve(OK_SEND);
      });
    },
  });
  const first = h.sendTick();
  h.clock.now = eat(FRI, '09:00'); // a new day is due while the previous run is still stuck
  await h.sendTick();
  assert.equal(calls, 1);
  assert.match(h.logs.join('\n'), /send status=skipped_in_flight/);
  release();
  await first;
  await h.sendTick();
  assert.equal(calls, 2);
});

test('send: a cycle that throws is caught, logged without detail, and later days still run', async () => {
  let calls = 0;
  const h = start(SEND_ONLY, eat(THU, '09:00'), {
    runSend: async () => {
      calls += 1;
      if (calls === 1) throw new Error('connect failed for host 10.0.0.1 password hunter2');
      return OK_SEND;
    },
  });
  await h.sendTick();
  assert.equal(calls, 1);
  assert.deepEqual(h.errors, ['[equity-scheduler] send status=error error=Error']);
  assert.ok(!h.errors.join().includes('hunter2'));
  h.clock.now = eat(THU, '09:05'); // failed run is not hammered again the same day
  await h.sendTick();
  assert.equal(calls, 1);
  h.clock.now = eat(FRI, '09:00');
  await h.sendTick();
  assert.equal(calls, 2);
});

test("send: 'locked' and 'disabled' are only logged", async () => {
  for (const status of ['locked', 'disabled'] as const) {
    const h = start(SEND_ONLY, eat(THU, '09:00'), { runSend: async () => ({ status }) });
    await h.sendTick();
    assert.deepEqual(h.logs.filter((l) => l.includes('send status')), [
      `[equity-scheduler] send status=${status}`,
    ]);
    assert.deepEqual(h.errors, []);
  }
});

test('send: log lines carry counts only', async () => {
  const dirty = {
    ...OK_SEND,
    phone: '+256700000001',
    name: 'Jane Farmer',
    contents: 'MSISDN,AMOUNT',
  } as unknown as EquityBatchCycleResult;
  const h = start(SEND_ONLY, eat(THU, '09:00'), { runSend: async () => dirty });
  await h.sendTick();
  const out = h.logs.join('\n');
  assert.ok(!out.includes('256700000001'));
  assert.ok(!out.includes('Jane'));
  assert.ok(!out.includes('MSISDN'));
});

// ---------------------------------------------------------------------------
// Release job
// ---------------------------------------------------------------------------

test('release: first run ~60s after startup, then every 5 minutes by default, only when AUTO_SEND is on', async () => {
  const h = start(RELEASE_ONLY, eat(THU, '03:00')); // time of day does not matter
  const first = h.timers.find((t) => t.kind === 'timeout');
  const repeat = h.timers.find((t) => t.kind === 'interval');
  assert.ok(first && repeat);
  assert.equal(first.ms, 60_000);
  assert.equal(repeat.ms, 5 * 60_000);
  assert.equal(h.releaseCalls, 0);
  await first.fn();
  assert.equal(h.releaseCalls, 1);
  await repeat.fn();
  await repeat.fn();
  assert.equal(h.releaseCalls, 3);
  assert.equal(h.sendCalls, 0, 'the daily payments job does not run');
  assert.equal(h.pollCalls, 0);
  assert.match(h.logs.join('\n'), /\[equity-scheduler\] release status=ok batches=1 rows=3 uploaded=1/);
});

test('release: without EQUITY_AUTO_SEND_ENABLED there is no release job, and a tick does nothing', async () => {
  for (const env of [
    { EQUITY_RESPONSE_POLL_ENABLED: 'true' },
    { EQUITY_RESPONSE_POLL_ENABLED: 'true', EQUITY_AUTO_SEND_ENABLED: 'false', EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
  ] as NodeJS.ProcessEnv[]) {
    const h = start(env, eat(THU, '09:00'));
    assert.deepEqual(h.timers.map((t) => t.ms), [INITIAL_POLL_DELAY_MS, 15 * 60_000]);
    await h.releaseTick();
    assert.equal(h.releaseCalls, 0);
  }
});

test('release: custom interval is used; invalid values fall back to 5; minimum 1', () => {
  const ms = (raw: string) =>
    start({ ...RELEASE_ONLY, EQUITY_RELEASE_POLL_INTERVAL_MINUTES: raw }, eat(THU, '09:00')).timers.find(
      (t) => t.kind === 'interval'
    )!.ms;
  assert.equal(ms('2'), 2 * 60_000);
  assert.equal(ms('0'), 60_000);
  assert.equal(ms('soon'), 5 * 60_000);
  assert.equal(ms('-3'), 5 * 60_000);
});

test('release: an overlapping release is skipped', async () => {
  let release: () => void = () => {};
  let calls = 0;
  const h = start(RELEASE_ONLY, eat(THU, '09:00'), {
    runRelease: () => {
      calls += 1;
      if (calls > 1) return Promise.resolve(OK_SEND);
      return new Promise<EquityBatchCycleResult>((resolve) => {
        release = () => resolve(OK_SEND);
      });
    },
  });
  const first = h.releaseTick();
  await h.releaseTick();
  assert.equal(calls, 1);
  assert.match(h.logs.join('\n'), /release status=skipped_in_flight/);
  release();
  await first;
  await h.releaseTick();
  assert.equal(calls, 2);
});

test('release and daily never run at the same time: a running daily run blocks the release tick', async () => {
  let finishDaily: () => void = () => {};
  const h = start(SEND_ONLY, eat(THU, '09:00'), {
    runSend: () =>
      new Promise<EquityBatchCycleResult>((resolve) => {
        finishDaily = () => resolve(OK_SEND);
      }),
  });
  const daily = h.sendTick();
  await h.releaseTick();
  assert.equal(h.releaseCalls, 0);
  assert.match(h.logs.join('\n'), /release status=skipped_in_flight/);
  finishDaily();
  await daily;
  await h.releaseTick();
  assert.equal(h.releaseCalls, 1);
});

test('release and daily never run at the same time: a running release blocks the daily run, which then goes ahead', async () => {
  let finishRelease: () => void = () => {};
  const h = start(SEND_ONLY, eat(THU, '09:00'), {
    runRelease: () => {
      h.releaseCalls += 1;
      return new Promise<EquityBatchCycleResult>((resolve) => {
        finishRelease = () => resolve(OK_SEND);
      });
    },
  });
  const release = h.releaseTick();
  await h.sendTick();
  assert.equal(h.sendCalls, 0);
  assert.match(h.logs.join('\n'), /send status=skipped_in_flight/);
  finishRelease();
  await release;
  // The skipped daily run did not use up today's run: the next minute's check still sends.
  h.clock.now = eat(THU, '09:01');
  await h.sendTick();
  assert.equal(h.sendCalls, 1);
});

test('release and daily: at no point are two cycles running at once', async () => {
  let running = 0;
  let maxRunning = 0;
  const cycle = async (): Promise<EquityBatchCycleResult> => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setImmediate(resolve));
    running -= 1;
    return OK_SEND;
  };
  const h = start(SEND_ONLY, eat(THU, '09:00'), { runSend: cycle, runRelease: cycle });
  await Promise.all([h.releaseTick(), h.sendTick(), h.releaseTick(), h.sendTick()]);
  assert.equal(maxRunning, 1);
});

test('release: a cycle that throws is caught, logged without detail, and later ticks still run', async () => {
  let calls = 0;
  const h = start(RELEASE_ONLY, eat(THU, '09:00'), {
    runRelease: async () => {
      calls += 1;
      if (calls === 1) throw new Error('connect failed for host 10.0.0.1 password hunter2');
      return OK_SEND;
    },
  });
  await h.releaseTick();
  assert.equal(calls, 1);
  assert.deepEqual(h.errors, ['[equity-scheduler] release status=error error=Error']);
  assert.ok(!h.errors.join().includes('hunter2'));
  await h.releaseTick();
  assert.equal(calls, 2, 'the in-flight guard was released after the failure');
  // A throwing release also does not block the daily job.
  const both = start(SEND_ONLY, eat(THU, '09:00'), {
    runRelease: async () => {
      throw new Error('boom');
    },
  });
  await both.releaseTick();
  await both.sendTick();
  assert.equal(both.sendCalls, 1);
});

test('release: a throwing logger does not crash the scheduler', async () => {
  const h = start(RELEASE_ONLY, eat(THU, '09:00'), {
    runRelease: async () => {
      throw new Error('boom');
    },
    logError: () => {
      throw new Error('logger down');
    },
  });
  await h.releaseTick();
});

test("release: 'locked' and 'disabled' are only logged; log lines carry counts only", async () => {
  for (const status of ['locked', 'disabled'] as const) {
    const h = start(RELEASE_ONLY, eat(THU, '09:00'), { runRelease: async () => ({ status }) });
    await h.releaseTick();
    assert.deepEqual(h.logs.filter((l) => l.includes('release status')), [
      `[equity-scheduler] release status=${status}`,
    ]);
    assert.deepEqual(h.errors, []);
  }
  const dirty = { ...OK_SEND, phone: '+256700000001', name: 'Jane Farmer' } as unknown as EquityBatchCycleResult;
  const h = start(RELEASE_ONLY, eat(THU, '09:00'), { runRelease: async () => dirty });
  await h.releaseTick();
  const out = h.logs.join('\n');
  assert.ok(!out.includes('256700000001'));
  assert.ok(!out.includes('Jane'));
});

// ---------------------------------------------------------------------------
// Daily job needs both switches
// ---------------------------------------------------------------------------

test('daily: does nothing unless EQUITY_AUTO_SEND_ENABLED and EQUITY_TASK_PAYMENTS_SEND_ENABLED are both exactly "true"', async () => {
  const bad = [undefined, 'false', 'TRUE', '1', 'yes', ' true'];
  const envs: NodeJS.ProcessEnv[] = [];
  for (const task of bad) envs.push({ EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: task });
  for (const auto of bad) envs.push({ EQUITY_AUTO_SEND_ENABLED: auto, EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' });
  for (const env of envs) {
    const h = start({ ...env, EQUITY_RESPONSE_POLL_ENABLED: 'true' }, eat(THU, '09:00'));
    assert.ok(
      !h.timers.some((t) => t.kind === 'interval' && t.ms === SEND_CHECK_INTERVAL_MS),
      `no daily timer: ${JSON.stringify(env)}`
    );
    await h.sendTick(); // inside the send window
    assert.equal(h.sendCalls, 0, JSON.stringify(env));
  }
  const on = start(SEND_ONLY, eat(THU, '09:00'));
  await on.sendTick();
  assert.equal(on.sendCalls, 1);
});

test('startup log line shows release, daily and poll flags as on or off only', () => {
  const line = (env: NodeJS.ProcessEnv) =>
    start(env, eat(THU, '09:00')).logs.find((l) => l.includes('started'));
  assert.equal(line(RELEASE_ONLY), '[equity-scheduler] started release=on daily=off poll=off');
  assert.equal(line(SEND_ONLY), '[equity-scheduler] started release=on daily=on poll=off');
  assert.equal(
    line({ EQUITY_RESPONSE_POLL_ENABLED: 'true' }),
    '[equity-scheduler] started release=off daily=off poll=on'
  );
  assert.equal(line(BOTH_ON), '[equity-scheduler] started release=on daily=on poll=on');
});

// ---------------------------------------------------------------------------
// Poll job
// ---------------------------------------------------------------------------

test('poll: first poll after ~60s, then every 15 minutes by default', async () => {
  const h = start({ EQUITY_RESPONSE_POLL_ENABLED: 'true' }, eat(THU, '09:00'));
  const first = h.timers.find((t) => t.kind === 'timeout');
  const repeat = h.timers.find((t) => t.kind === 'interval');
  assert.ok(first && repeat);
  assert.equal(first.ms, INITIAL_POLL_DELAY_MS);
  assert.equal(repeat.ms, 15 * 60_000);
  await first.fn();
  assert.equal(h.pollCalls, 1);
  await repeat.fn();
  assert.equal(h.pollCalls, 2);
  assert.match(h.logs.join('\n'), /\[equity-scheduler\] poll status=ok filesSeen=2 filesNew=1 filesProcessed=1/);
  // The send job is off, so no send timer exists.
  assert.equal(h.timers.filter((t) => t.kind === 'interval').length, 1);
});

test('poll: an overlapping poll is skipped', async () => {
  let release: () => void = () => {};
  let calls = 0;
  const h = start({ EQUITY_RESPONSE_POLL_ENABLED: 'true' }, eat(THU, '09:00'), {
    runPoll: () => {
      calls += 1;
      if (calls > 1) return Promise.resolve(OK_POLL);
      return new Promise<EquityResponsePollResult>((resolve) => {
        release = () => resolve(OK_POLL);
      });
    },
  });
  const first = h.pollTick();
  await h.pollTick();
  assert.equal(calls, 1);
  release();
  await first;
  await h.pollTick();
  assert.equal(calls, 2);
});

test('poll: a poll that throws does not stop later polls', async () => {
  let calls = 0;
  const h = start({ EQUITY_RESPONSE_POLL_ENABLED: 'true' }, eat(THU, '09:00'), {
    runPoll: async () => {
      calls += 1;
      if (calls === 1) throw new Error('sftp down');
      return OK_POLL;
    },
  });
  await h.pollTick();
  await h.pollTick();
  assert.equal(calls, 2);
  assert.deepEqual(h.errors, ['[equity-scheduler] poll status=error error=Error']);
});

test("poll: 'disabled' result is only logged", async () => {
  const h = start({ EQUITY_RESPONSE_POLL_ENABLED: 'true' }, eat(THU, '09:00'), {
    runPoll: async () => ({ status: 'disabled' }),
  });
  await h.pollTick();
  assert.ok(h.logs.includes('[equity-scheduler] poll status=disabled'));
  assert.deepEqual(h.errors, []);
});

// ---------------------------------------------------------------------------
// Switches, lifecycle, env parsing
// ---------------------------------------------------------------------------

test('both switches off (or not exactly "true"): nothing starts, no timers', async () => {
  for (const env of [
    {},
    { EQUITY_AUTO_SEND_ENABLED: 'false', EQUITY_RESPONSE_POLL_ENABLED: 'false' },
    { EQUITY_AUTO_SEND_ENABLED: 'TRUE', EQUITY_RESPONSE_POLL_ENABLED: '1' },
    { EQUITY_AUTO_SEND_ENABLED: ' true', EQUITY_RESPONSE_POLL_ENABLED: 'yes' },
    // The old-route switch alone starts nothing.
    { EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
  ] as NodeJS.ProcessEnv[]) {
    const h = start(env, eat(THU, '09:00'));
    assert.equal(h.timers.length, 0);
    assert.equal(h.sendCalls + h.pollCalls, 0);
    assert.deepEqual(h.logs, []);
  }
});

test('only the enabled jobs get timers', () => {
  // Release only (old route off): 60s first run + interval, no once-a-minute daily check.
  const release = start(RELEASE_ONLY, eat(THU, '09:00'));
  assert.deepEqual(release.timers.map((t) => [t.kind, t.ms]), [
    ['timeout', INITIAL_RELEASE_DELAY_MS],
    ['interval', 5 * 60_000],
  ]);
  // Release + daily.
  const send = start(SEND_ONLY, eat(THU, '09:00'));
  assert.deepEqual(send.timers.map((t) => t.kind), ['timeout', 'interval', 'interval']);
  assert.ok(send.timers.some((t) => t.kind === 'interval' && t.ms === SEND_CHECK_INTERVAL_MS));
  // Poll only.
  const poll = start({ EQUITY_RESPONSE_POLL_ENABLED: 'true' }, eat(THU, '09:00'));
  assert.deepEqual(poll.timers.map((t) => t.kind), ['timeout', 'interval']);
  const both = start(BOTH_ON, eat(THU, '09:00'));
  assert.equal(both.timers.length, 5);
});

test('stop clears every timer and later ticks do nothing', async () => {
  const h = start(BOTH_ON, eat(THU, '09:00'));
  h.stop();
  assert.ok(h.timers.every((t) => t.cleared));
  await h.sendTick();
  await h.pollTick();
  assert.equal(h.sendCalls + h.pollCalls, 0);
});

test('stopEquityScheduler clears timers; start is idempotent while running', () => {
  const h = start(BOTH_ON, eat(THU, '09:00'));
  const again = startEquityScheduler({ env: BOTH_ON });
  assert.ok(again);
  assert.equal(h.timers.length, 5);
  stopEquityScheduler();
  assert.ok(h.timers.every((t) => t.cleared));
});

test('invalid env values fall back to defaults', () => {
  const defaults = loadEquitySchedulerConfig({});
  assert.equal(defaults.sendMinuteOfDay, 9 * 60);
  assert.deepEqual(defaults.sendDays, [1, 2, 3, 4, 5]);
  assert.equal(defaults.sendWindowMinutes, 4 * 60);
  assert.equal(defaults.pollIntervalMinutes, 15);
  assert.equal(defaults.releaseIntervalMinutes, 5);
  assert.equal(defaults.releaseEnabled, false);
  assert.equal(defaults.sendEnabled, false);

  const bad = loadEquitySchedulerConfig({
    EQUITY_AUTO_SEND_TIME_EAT: '25:00',
    EQUITY_AUTO_SEND_DAYS: '1,8,x',
    EQUITY_AUTO_SEND_WINDOW_HOURS: '-3',
    EQUITY_RESPONSE_POLL_INTERVAL_MINUTES: 'soon',
    EQUITY_RELEASE_POLL_INTERVAL_MINUTES: 'often',
  });
  assert.deepEqual(bad, { ...defaults });

  for (const time of ['9am', '09:60', '', '9', '24:00']) {
    assert.equal(loadEquitySchedulerConfig({ EQUITY_AUTO_SEND_TIME_EAT: time }).sendMinuteOfDay, 540, time);
  }
  for (const days of ['', '0', '1,,2', 'mon', '1;2']) {
    assert.deepEqual(loadEquitySchedulerConfig({ EQUITY_AUTO_SEND_DAYS: days }).sendDays, [1, 2, 3, 4, 5], days);
  }
  for (const hours of ['0', 'abc', '25', 'NaN', '']) {
    assert.equal(loadEquitySchedulerConfig({ EQUITY_AUTO_SEND_WINDOW_HOURS: hours }).sendWindowMinutes, 240, hours);
  }
  for (const mins of ['', '0.5', '-1', 'abc', '1e3', 'NaN']) {
    const got = loadEquitySchedulerConfig({ EQUITY_RESPONSE_POLL_INTERVAL_MINUTES: mins }).pollIntervalMinutes;
    assert.equal(got, 15, mins);
  }
  for (const mins of ['', '0.5', '-1', 'abc', '1e3', 'NaN', ' ', '99999999999999999999']) {
    const got = loadEquitySchedulerConfig({ EQUITY_RELEASE_POLL_INTERVAL_MINUTES: mins }).releaseIntervalMinutes;
    assert.equal(got, 5, mins);
  }
});

test('release interval: valid values are used, minimum is 1', () => {
  assert.equal(loadEquitySchedulerConfig({ EQUITY_RELEASE_POLL_INTERVAL_MINUTES: '10' }).releaseIntervalMinutes, 10);
  assert.equal(loadEquitySchedulerConfig({ EQUITY_RELEASE_POLL_INTERVAL_MINUTES: '1' }).releaseIntervalMinutes, 1);
  assert.equal(loadEquitySchedulerConfig({ EQUITY_RELEASE_POLL_INTERVAL_MINUTES: '0' }).releaseIntervalMinutes, 1);
});

test('release and daily switches: release needs AUTO_SEND, daily needs both exactly "true"', () => {
  for (const auto of [undefined, 'false', 'TRUE', '1', 'yes', ' true']) {
    for (const task of [undefined, 'false', 'TRUE', '1', 'yes', ' true', 'true']) {
      const cfg = loadEquitySchedulerConfig({
        EQUITY_AUTO_SEND_ENABLED: auto,
        EQUITY_TASK_PAYMENTS_SEND_ENABLED: task,
      });
      assert.equal(cfg.releaseEnabled, false, `${auto}/${task}`);
      assert.equal(cfg.sendEnabled, false, `${auto}/${task}`);
    }
  }
  for (const task of [undefined, 'false', 'TRUE', '1', 'yes', ' true']) {
    const cfg = loadEquitySchedulerConfig({ EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: task });
    assert.equal(cfg.releaseEnabled, true, String(task));
    assert.equal(cfg.sendEnabled, false, String(task));
  }
  const both = loadEquitySchedulerConfig({
    EQUITY_AUTO_SEND_ENABLED: 'true',
    EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true',
  });
  assert.equal(both.releaseEnabled, true);
  assert.equal(both.sendEnabled, true);
});

test('valid env values are parsed; poll interval has a minimum of 5', () => {
  const cfg = loadEquitySchedulerConfig({
    EQUITY_AUTO_SEND_TIME_EAT: '7:05',
    EQUITY_AUTO_SEND_DAYS: '7, 1,1',
    EQUITY_AUTO_SEND_WINDOW_HOURS: '2.5',
    EQUITY_RESPONSE_POLL_INTERVAL_MINUTES: '30',
  });
  assert.equal(cfg.sendMinuteOfDay, 7 * 60 + 5);
  assert.deepEqual(cfg.sendDays, [1, 7]);
  assert.equal(cfg.sendWindowMinutes, 150);
  assert.equal(cfg.pollIntervalMinutes, 30);
  for (const mins of ['1', '4', '0']) {
    assert.equal(loadEquitySchedulerConfig({ EQUITY_RESPONSE_POLL_INTERVAL_MINUTES: mins }).pollIntervalMinutes, 5);
  }
});

test('isSendDue: window end is exclusive and midnight does not wrap', () => {
  const cfg = { sendMinuteOfDay: 23 * 60, sendDays: [1, 2, 3, 4, 5, 6, 7], sendWindowMinutes: 240 };
  assert.equal(isSendDue(cfg, eat(THU, '23:59'), null), true);
  assert.equal(isSendDue(cfg, eat(FRI, '00:30'), THU), false);
  assert.equal(isSendDue(cfg, eat(FRI, '00:30'), null), false);
  const normal = { ...cfg, sendMinuteOfDay: 540 };
  assert.equal(isSendDue(normal, eat(THU, '12:59'), null), true);
  assert.equal(isSendDue(normal, eat(THU, '13:00'), null), false);
});
