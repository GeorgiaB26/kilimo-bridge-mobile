import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const REMINDER_KEY = 'kilimo_task_reminders';

export type ReminderType = '1_day_before' | '3_days_before' | 'on_due_date';

export interface StoredTaskReminder {
  taskId: string;
  taskName: string;
  reminderType: ReminderType;
  reminderDate: string;
  dueDate: string;
  shown?: boolean;
}

async function readReminders(): Promise<StoredTaskReminder[]> {
  const raw = await AsyncStorage.getItem(REMINDER_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredTaskReminder[];
  } catch {
    return [];
  }
}

async function writeReminders(items: StoredTaskReminder[]): Promise<void> {
  await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(items));
}

export function computeReminderDate(dueDate: string, reminderType: ReminderType): Date | null {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const reminder = new Date(due);
  reminder.setHours(9, 0, 0, 0);
  if (reminderType === '1_day_before') {
    reminder.setDate(reminder.getDate() - 1);
  } else if (reminderType === '3_days_before') {
    reminder.setDate(reminder.getDate() - 3);
  }
  return reminder;
}

export async function setTaskReminder(
  taskId: string,
  taskName: string,
  dueDate: string,
  reminderType: ReminderType
): Promise<void> {
  const reminderDate = computeReminderDate(dueDate, reminderType);
  if (!reminderDate) {
    Alert.alert('Invalid date', 'Could not schedule reminder for this task.');
    return;
  }
  const all = await readReminders();
  const filtered = all.filter((r) => r.taskId !== taskId);
  filtered.push({
    taskId,
    taskName,
    reminderType,
    reminderDate: reminderDate.toISOString(),
    dueDate,
    shown: false,
  });
  await writeReminders(filtered);
  const label =
    reminderType === 'on_due_date'
      ? 'on the due date'
      : reminderType === '1_day_before'
        ? '1 day before'
        : '3 days before';
  Alert.alert('Reminder set', `You will be reminded ${label} for "${taskName}".`);
}

/** Show in-app banner alerts for reminders that are due */
export async function checkAndShowTaskReminders(): Promise<void> {
  const all = await readReminders();
  const now = new Date();
  let changed = false;
  for (const r of all) {
    if (r.shown) continue;
    const when = new Date(r.reminderDate);
    if (Number.isNaN(when.getTime()) || when > now) continue;
    const due = new Date(r.dueDate);
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    Alert.alert(
      `Reminder: ${r.taskName}`,
      daysLeft <= 0
        ? 'This task is due today or overdue.'
        : `Due in ${daysLeft} day(s).`
    );
    r.shown = true;
    changed = true;
  }
  if (changed) {
    await writeReminders(all);
  }
}
