/**
 * Farmer profile photos must be real camera/gallery images stored as R2 object keys,
 * HTTPS URLs (signed or public), or legacy data URLs.
 * Initials avatars and file:// device URIs are never valid for registration or display.
 */

const R2_OBJECT_KEY_RE = /^(farmers|tasks|support)\/[A-Za-z0-9._\-/]+$/;

export function isR2ObjectKey(url?: string | null): boolean {
  if (!url?.trim()) return false;
  return R2_OBJECT_KEY_RE.test(url.trim()) && !url.includes('://');
}

export function isUsableFarmerPhotoUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.startsWith('file://') || u.startsWith('content://')) return false;
  if (isR2ObjectKey(u)) return true;
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
  // Prefer R2 object keys / https for new writes; still allow legacy data URLs when reading old rows
  if (picture.trim().startsWith('data:image/') && picture.length > 200_000) {
    return 'Photo is too large. Upload via the app so it can be stored in cloud storage.';
  }
  return null;
}
