/** Web: no local image files — always use the remote URL. */

export async function getCachedTaskPhotoUri(
  _taskId: string,
  remoteUrl?: string | null,
  _userScope?: string
): Promise<string | null> {
  return remoteUrl?.trim() || null;
}

export function scheduleAgentTaskPhotoWarm(_userScope: string): void {
  /* no-op on web */
}
