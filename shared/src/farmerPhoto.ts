/**
 * Farmer profile photos must be real camera/gallery images stored as data URLs or HTTPS URLs.
 * Initials avatars and file:// device URIs are never valid for registration or display.
 */

export function isUsableFarmerPhotoUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.startsWith('file://') || u.startsWith('content://')) return false;
  if (u.startsWith('data:image/jpeg') || u.startsWith('data:image/png') || u.startsWith('data:image/webp')) {
    return u.length > 100;
  }
  if (u.startsWith('https://') || u.startsWith('http://')) return true;
  return false;
}

export function validateFarmerPhotoRequired(picture?: string | null): string | null {
  if (!picture?.trim()) {
    return 'A verification photo is required. Use camera or gallery — initials avatars are not allowed.';
  }
  if (!isUsableFarmerPhotoUrl(picture)) {
    return 'Photo must be a camera or gallery image (JPEG/PNG). Upload a real photo of the farmer.';
  }
  return null;
}
