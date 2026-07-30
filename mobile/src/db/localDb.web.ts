/** Web stub — expo-sqlite is native-only; web uses API / Supabase directly. */
export const isNativeOfflineCapable = false;

export async function getLocalDb(): Promise<null> {
  return null;
}

export async function clearLocalDb(): Promise<void> {
  /* noop */
}
