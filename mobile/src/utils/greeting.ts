export interface LocalizedGreeting {
  /** Greeting in the farmer's local language */
  primary: string;
  /** English translation shown underneath */
  secondary: string;
  languageName: string;
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const GREETINGS: Record<string, Record<TimeOfDay, (name: string) => { primary: string; secondary: string; languageName: string }>> = {
  Kenya: {
    morning: (n) => ({ primary: `Habari za asubuhi, ${n}!`, secondary: `Good morning, ${n}!`, languageName: 'Swahili' }),
    afternoon: (n) => ({ primary: `Habari za mchana, ${n}!`, secondary: `Good afternoon, ${n}!`, languageName: 'Swahili' }),
    evening: (n) => ({ primary: `Habari za jioni, ${n}!`, secondary: `Good evening, ${n}!`, languageName: 'Swahili' }),
  },
  Tanzania: {
    morning: (n) => ({ primary: `Habari za asubuhi, ${n}!`, secondary: `Good morning, ${n}!`, languageName: 'Swahili' }),
    afternoon: (n) => ({ primary: `Habari za mchana, ${n}!`, secondary: `Good afternoon, ${n}!`, languageName: 'Swahili' }),
    evening: (n) => ({ primary: `Habari za jioni, ${n}!`, secondary: `Good evening, ${n}!`, languageName: 'Swahili' }),
  },
  Uganda: {
    morning: (n) => ({ primary: `Wasuze otya nno, ${n}!`, secondary: `Good morning, ${n}!`, languageName: 'Luganda' }),
    afternoon: (n) => ({ primary: `Osiibye otya nno, ${n}!`, secondary: `Good afternoon, ${n}!`, languageName: 'Luganda' }),
    evening: (n) => ({ primary: `Osiibye otya nno, ${n}!`, secondary: `Good evening, ${n}!`, languageName: 'Luganda' }),
  },
  Rwanda: {
    morning: (n) => ({ primary: `Mwaramutse, ${n}!`, secondary: `Good morning, ${n}!`, languageName: 'Kinyarwanda' }),
    afternoon: (n) => ({ primary: `Mwiriwe, ${n}!`, secondary: `Good afternoon, ${n}!`, languageName: 'Kinyarwanda' }),
    evening: (n) => ({ primary: `Mwiriwe, ${n}!`, secondary: `Good evening, ${n}!`, languageName: 'Kinyarwanda' }),
  },
  Burundi: {
    morning: (n) => ({ primary: `Mwaramutse, ${n}!`, secondary: `Good morning, ${n}!`, languageName: 'Kirundi' }),
    afternoon: (n) => ({ primary: `Mwiriwe, ${n}!`, secondary: `Good afternoon, ${n}!`, languageName: 'Kirundi' }),
    evening: (n) => ({ primary: `Mwiriwe, ${n}!`, secondary: `Good evening, ${n}!`, languageName: 'Kirundi' }),
  },
  'Democratic Republic of Congo': {
    morning: (n) => ({ primary: `Bonjour, ${n}!`, secondary: `Good morning, ${n}!`, languageName: 'French' }),
    afternoon: (n) => ({ primary: `Bon après-midi, ${n}!`, secondary: `Good afternoon, ${n}!`, languageName: 'French' }),
    evening: (n) => ({ primary: `Bonsoir, ${n}!`, secondary: `Good evening, ${n}!`, languageName: 'French' }),
  },
  'South Sudan': {
    morning: (n) => ({ primary: `Good morning, ${n}!`, secondary: `أَصْبَحَكُمُ اللهُ بِخَيْر`, languageName: 'English / Arabic' }),
    afternoon: (n) => ({ primary: `Good afternoon, ${n}!`, secondary: `مساء الخير`, languageName: 'English / Arabic' }),
    evening: (n) => ({ primary: `Good evening, ${n}!`, secondary: `مساء الخير`, languageName: 'English / Arabic' }),
  },
  Somalia: {
    morning: (n) => ({ primary: `Subax wanaagsan, ${n}!`, secondary: `Good morning, ${n}!`, languageName: 'Somali' }),
    afternoon: (n) => ({ primary: `Galab wanaagsan, ${n}!`, secondary: `Good afternoon, ${n}!`, languageName: 'Somali' }),
    evening: (n) => ({ primary: `Habeen wanaagsan, ${n}!`, secondary: `Good evening, ${n}!`, languageName: 'Somali' }),
  },
};

/** English-only time greeting (legacy) */
export function getTimeGreeting(): string {
  const tod = getTimeOfDay();
  if (tod === 'morning') return 'Good morning';
  if (tod === 'afternoon') return 'Good afternoon';
  return 'Good evening';
}

/** Greeting in the farmer's local language based on their country */
export function getLocalizedGreeting(country: string | undefined, fullName: string): LocalizedGreeting {
  const firstName = fullName.trim().split(/\s+/)[0] || 'Farmer';
  const countryKey = country?.trim() || 'Kenya';
  const tod = getTimeOfDay();
  const config = GREETINGS[countryKey] ?? GREETINGS.Kenya;
  return config[tod](firstName);
}

export function formatProjectStatus(status: string): { label: string; variant: 'success' | 'pending' | 'info' | 'warning' } {
  switch (status) {
    case 'Completed':
      return { label: 'Completed', variant: 'success' };
    case 'In Progress':
      return { label: 'In progress', variant: 'info' };
    case 'Assigned':
      return { label: 'Not started', variant: 'pending' };
    default:
      return { label: status, variant: 'info' };
  }
}

export function formatDueDate(dateStr?: string | null): string {
  if (!dateStr) return 'No due date set';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
