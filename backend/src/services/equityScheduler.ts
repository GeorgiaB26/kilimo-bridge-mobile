/**
 * In-process scheduler for the Equity Uganda payment cycle.
 *
 *  - Release job: runEquityPortalBatchCycle every EQUITY_RELEASE_POLL_INTERVAL_MINUTES (default 5,
 *    minimum 1), first run about 60 seconds after startup. Sends the payment lines a Banking Agent
 *    released in the portal. Only exists if EQUITY_AUTO_SEND_ENABLED is 'true'.
 *  - Daily send job (the OLD payments-table route): once per EAT day (on selected weekdays) at/after EQUITY_AUTO_SEND_TIME_EAT, within
 *    EQUITY_AUTO_SEND_WINDOW_HOURS after it. Checked once a minute. The "already ran today" marker
 *    is in memory, so a redeploy inside the window triggers a catch-up run; a repeat run is
 *    harmless because the batch builder only picks up unsent payments. The marker is set when the
 *    run STARTS, so a failing cycle is not retried every minute against the bank. Only exists if
 *    BOTH EQUITY_AUTO_SEND_ENABLED and EQUITY_TASK_PAYMENTS_SEND_ENABLED are 'true'.
 *  - Poll job: runEquityResponsePoll every EQUITY_RESPONSE_POLL_INTERVAL_MINUTES, first poll about
 *    60 seconds after startup.
 *
 * Each job only exists if its env switches are exactly 'true' (the cycle functions re-check them).
 * Runs never overlap (the release and daily jobs share one guard, so they never run at the same
 * time either; a job that finds the other running skips and tries again on its next tick), never
 * throw out of the scheduler, and log counts only (no names, phone
 * numbers, file contents or secrets).
 */
import { getEastAfricaTimeParts } from './equityCountryConfig';
import {
  runEquityBatchCycle,
  runEquityPortalBatchCycle,
  type EquityBatchCycleResult,
} from './equitySftpService';
import { runEquityResponsePoll, type EquityResponsePollResult } from './equityResponseService';

export const DEFAULT_SEND_TIME_EAT = '09:00';
export const DEFAULT_SEND_DAYS: readonly number[] = [1, 2, 3, 4, 5];
export const DEFAULT_SEND_WINDOW_HOURS = 4;
export const DEFAULT_POLL_INTERVAL_MINUTES = 15;
export const MIN_POLL_INTERVAL_MINUTES = 5;
export const DEFAULT_RELEASE_INTERVAL_MINUTES = 5;
export const MIN_RELEASE_INTERVAL_MINUTES = 1;
export const SEND_CHECK_INTERVAL_MS = 60_000;
export const INITIAL_POLL_DELAY_MS = 60_000;
export const INITIAL_RELEASE_DELAY_MS = 60_000;

const LOG_PREFIX = '[equity-scheduler]';

// ---------------------------------------------------------------------------
// Config parsing (invalid values fall back to defaults)
// ---------------------------------------------------------------------------

export type EquitySchedulerConfig = {
  /** Portal release job (EQUITY_AUTO_SEND_ENABLED). */
  releaseEnabled: boolean;
  /** Daily payments-table job (EQUITY_AUTO_SEND_ENABLED and EQUITY_TASK_PAYMENTS_SEND_ENABLED). */
  sendEnabled: boolean;
  pollEnabled: boolean;
  /** Minutes after midnight EAT. */
  sendMinuteOfDay: number;
  /** 1 = Monday ... 7 = Sunday. */
  sendDays: number[];
  sendWindowMinutes: number;
  pollIntervalMinutes: number;
  releaseIntervalMinutes: number;
};

export function parseSendTime(raw: string | undefined): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((raw ?? '').trim());
  if (!match) {
    const [h, m] = DEFAULT_SEND_TIME_EAT.split(':').map(Number);
    return h * 60 + m;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseSendDays(raw: string | undefined): number[] {
  const text = (raw ?? '').trim();
  if (!text) return [...DEFAULT_SEND_DAYS];
  const days = new Set<number>();
  for (const token of text.split(',')) {
    const t = token.trim();
    if (!/^[1-7]$/.test(t)) return [...DEFAULT_SEND_DAYS];
    days.add(Number(t));
  }
  return [...days].sort((a, b) => a - b);
}

export function parseSendWindowHours(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return DEFAULT_SEND_WINDOW_HOURS;
  const hours = Number(text);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return DEFAULT_SEND_WINDOW_HOURS;
  return hours;
}

export function parsePollIntervalMinutes(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text)) return DEFAULT_POLL_INTERVAL_MINUTES;
  const minutes = Number(text);
  if (!Number.isSafeInteger(minutes)) return DEFAULT_POLL_INTERVAL_MINUTES;
  return Math.max(MIN_POLL_INTERVAL_MINUTES, minutes);
}

export function parseReleaseIntervalMinutes(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text)) return DEFAULT_RELEASE_INTERVAL_MINUTES;
  const minutes = Number(text);
  if (!Number.isSafeInteger(minutes)) return DEFAULT_RELEASE_INTERVAL_MINUTES;
  return Math.max(MIN_RELEASE_INTERVAL_MINUTES, minutes);
}

export function loadEquitySchedulerConfig(env: NodeJS.ProcessEnv = process.env): EquitySchedulerConfig {
  return {
    releaseEnabled: env.EQUITY_AUTO_SEND_ENABLED === 'true',
    sendEnabled:
      env.EQUITY_AUTO_SEND_ENABLED === 'true' && env.EQUITY_TASK_PAYMENTS_SEND_ENABLED === 'true',
    pollEnabled: env.EQUITY_RESPONSE_POLL_ENABLED === 'true',
    sendMinuteOfDay: parseSendTime(env.EQUITY_AUTO_SEND_TIME_EAT),
    sendDays: parseSendDays(env.EQUITY_AUTO_SEND_DAYS),
    sendWindowMinutes: Math.round(parseSendWindowHours(env.EQUITY_AUTO_SEND_WINDOW_HOURS) * 60),
    pollIntervalMinutes: parsePollIntervalMinutes(env.EQUITY_RESPONSE_POLL_INTERVAL_MINUTES),
    releaseIntervalMinutes: parseReleaseIntervalMinutes(env.EQUITY_RELEASE_POLL_INTERVAL_MINUTES),
  };
}

// ---------------------------------------------------------------------------
// Send-time decision (pure)
// ---------------------------------------------------------------------------

/** EAT calendar date as YYYY-MM-DD plus ISO weekday (1 = Mon ... 7 = Sun) and minute of day. */
export function eatClock(now: Date): { dateKey: string; isoWeekday: number; minuteOfDay: number } {
  const p = getEastAfricaTimeParts(now);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sunday
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return {
    dateKey: `${p.year}-${mm}-${dd}`,
    isoWeekday: dow === 0 ? 7 : dow,
    minuteOfDay: p.hour * 60 + p.minute,
  };
}

export function isSendDue(
  config: Pick<EquitySchedulerConfig, 'sendMinuteOfDay' | 'sendDays' | 'sendWindowMinutes'>,
  now: Date,
  lastRunDateKey: string | null
): boolean {
  const clock = eatClock(now);
  if (!config.sendDays.includes(clock.isoWeekday)) return false;
  if (lastRunDateKey === clock.dateKey) return false;
  if (clock.minuteOfDay < config.sendMinuteOfDay) return false;
  return clock.minuteOfDay < config.sendMinuteOfDay + config.sendWindowMinutes;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

type TimerHandle = unknown;

export type EquitySchedulerTimers = {
  setTimeout: (fn: () => unknown, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
  setInterval: (fn: () => unknown, ms: number) => TimerHandle;
  clearInterval: (handle: TimerHandle) => void;
};

export type EquitySchedulerDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  /** Daily payments-table cycle. */
  runSend?: () => Promise<EquityBatchCycleResult>;
  /** Portal release cycle. */
  runRelease?: () => Promise<EquityBatchCycleResult>;
  runPoll?: () => Promise<EquityResponsePollResult>;
  timers?: EquitySchedulerTimers;
  log?: (line: string) => void;
  logError?: (line: string) => void;
};

export type EquitySchedulerHandle = {
  /** Run one send check now (what the once-a-minute timer does). */
  sendTick: () => Promise<void>;
  /** Run one portal release cycle now (what the release timers do). */
  releaseTick: () => Promise<void>;
  /** Run one poll now (what the interval timer does). */
  pollTick: () => Promise<void>;
  stop: () => void;
};

function unrefTimer(handle: unknown): unknown {
  const h = handle as { unref?: () => void } | null;
  if (h && typeof h.unref === 'function') h.unref();
  return handle;
}

const realTimers: EquitySchedulerTimers = {
  setTimeout: (fn, ms) => unrefTimer(setTimeout(() => void fn(), ms)),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
  setInterval: (fn, ms) => unrefTimer(setInterval(() => void fn(), ms)),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Counts-only description of a result; picks known numeric fields so nothing else can leak. */
function formatCounts(result: object, keys: readonly string[]): string {
  const record = result as Record<string, unknown>;
  return keys.map((k) => `${k}=${num(record[k])}`).join(' ');
}

const SEND_COUNT_KEYS = [
  'batches',
  'rows',
  'uploaded',
  'failed',
  'uncertain',
  'skipped',
  'deferred',
  'unrecorded',
] as const;
const POLL_COUNT_KEYS = [
  'filesSeen',
  'filesNew',
  'filesProcessed',
  'duplicates',
  'success',
  'failed',
  'needsReview',
  'unmatched',
  'errors',
] as const;

let active: EquitySchedulerHandle | null = null;

export function startEquityScheduler(deps: EquitySchedulerDeps = {}): EquitySchedulerHandle | null {
  if (active) return active;

  const env = deps.env ?? process.env;
  const config = loadEquitySchedulerConfig(env);
  if (!config.releaseEnabled && !config.sendEnabled && !config.pollEnabled) return null;

  const now = deps.now ?? (() => new Date());
  const timers = deps.timers ?? realTimers;
  const log = deps.log ?? ((line: string) => console.log(line));
  const logError = deps.logError ?? ((line: string) => console.error(line));
  const runSend = deps.runSend ?? (() => runEquityBatchCycle({ dryRun: false }));
  const runRelease = deps.runRelease ?? (() => runEquityPortalBatchCycle({ dryRun: false }));
  const runPoll = deps.runPoll ?? (() => runEquityResponsePoll());

  const handles: Array<{ kind: 'timeout' | 'interval'; handle: TimerHandle }> = [];
  // Shared by the release and daily jobs: they send through the same SFTP account and must
  // never run at the same time.
  let sendInFlight = false;
  let pollInFlight = false;
  let lastSendDateKey: string | null = null;
  let stopped = false;

  const errorLine = (job: string, err: unknown): string => {
    // Error class only: messages can carry paths, hostnames or other sensitive detail.
    const name = err instanceof Error && err.name ? err.name : 'UnknownError';
    return `${LOG_PREFIX} ${job} status=error error=${name.replace(/[^\w.-]/g, '')}`;
  };

  const sendTick = async (): Promise<void> => {
    try {
      if (stopped || !config.sendEnabled) return;
      if (!isSendDue(config, now(), lastSendDateKey)) return;
      if (sendInFlight) {
        log(`${LOG_PREFIX} send status=skipped_in_flight`);
        return;
      }
      sendInFlight = true;
      // Marked at start: a failing cycle is retried tomorrow, not every minute.
      lastSendDateKey = eatClock(now()).dateKey;
      try {
        const result = await runSend();
        if (result.status === 'locked' || result.status === 'disabled') {
          log(`${LOG_PREFIX} send status=${result.status}`);
        } else {
          log(`${LOG_PREFIX} send status=${result.status} ${formatCounts(result, SEND_COUNT_KEYS)}`);
        }
      } finally {
        sendInFlight = false;
      }
    } catch (err) {
      try {
        logError(errorLine('send', err));
      } catch {
        /* never let logging crash the process */
      }
    }
  };

  const releaseTick = async (): Promise<void> => {
    try {
      if (stopped || !config.releaseEnabled) return;
      if (sendInFlight) {
        log(`${LOG_PREFIX} release status=skipped_in_flight`);
        return;
      }
      sendInFlight = true;
      try {
        const result = await runRelease();
        if (result.status === 'locked' || result.status === 'disabled') {
          log(`${LOG_PREFIX} release status=${result.status}`);
        } else {
          log(`${LOG_PREFIX} release status=${result.status} ${formatCounts(result, SEND_COUNT_KEYS)}`);
        }
      } finally {
        sendInFlight = false;
      }
    } catch (err) {
      try {
        logError(errorLine('release', err));
      } catch {
        /* never let logging crash the process */
      }
    }
  };

  const pollTick = async (): Promise<void> => {
    try {
      if (stopped) return;
      if (pollInFlight) {
        log(`${LOG_PREFIX} poll status=skipped_in_flight`);
        return;
      }
      pollInFlight = true;
      try {
        const result = await runPoll();
        if (result.status === 'disabled') {
          log(`${LOG_PREFIX} poll status=disabled`);
        } else {
          log(`${LOG_PREFIX} poll status=${result.status} ${formatCounts(result, POLL_COUNT_KEYS)}`);
        }
      } finally {
        pollInFlight = false;
      }
    } catch (err) {
      try {
        logError(errorLine('poll', err));
      } catch {
        /* never let logging crash the process */
      }
    }
  };

  if (config.releaseEnabled) {
    handles.push({
      kind: 'timeout',
      handle: timers.setTimeout(releaseTick, INITIAL_RELEASE_DELAY_MS),
    });
    handles.push({
      kind: 'interval',
      handle: timers.setInterval(releaseTick, config.releaseIntervalMinutes * 60_000),
    });
  }
  if (config.sendEnabled) {
    handles.push({
      kind: 'interval',
      handle: timers.setInterval(sendTick, SEND_CHECK_INTERVAL_MS),
    });
  }
  if (config.pollEnabled) {
    handles.push({
      kind: 'timeout',
      handle: timers.setTimeout(pollTick, INITIAL_POLL_DELAY_MS),
    });
    handles.push({
      kind: 'interval',
      handle: timers.setInterval(pollTick, config.pollIntervalMinutes * 60_000),
    });
  }

  log(
    `${LOG_PREFIX} started release=${config.releaseEnabled ? 'on' : 'off'} daily=${config.sendEnabled ? 'on' : 'off'} poll=${config.pollEnabled ? 'on' : 'off'}`
  );

  const handle: EquitySchedulerHandle = {
    sendTick,
    releaseTick,
    pollTick,
    stop: () => {
      stopped = true;
      for (const h of handles) {
        if (h.kind === 'timeout') timers.clearTimeout(h.handle);
        else timers.clearInterval(h.handle);
      }
      handles.length = 0;
      if (active === handle) active = null;
    },
  };
  active = handle;
  return handle;
}

export function stopEquityScheduler(): void {
  active?.stop();
}
