import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const MIN_SIZE = 480;
const MAX_BYTES = 5 * 1024 * 1024;

export interface PhotoValidationResult {
  ok: boolean;
  error?: string;
  width?: number;
  height?: number;
}

export async function validatePhotoAsset(asset: ImagePicker.ImagePickerAsset): Promise<PhotoValidationResult> {
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;

  if (w < MIN_SIZE || h < MIN_SIZE) {
    return {
      ok: false,
      error: `Photo must be at least ${MIN_SIZE}×${MIN_SIZE} pixels. This image is ${w}×${h}. Please retake closer or use a higher resolution.`,
      width: w,
      height: h,
    };
  }

  try {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (info.exists && 'size' in info && info.size != null && info.size > MAX_BYTES) {
      return {
        ok: false,
        error: 'Photo is too large (max 5 MB). Try again with lower quality or crop.',
      };
    }
  } catch {
    // skip size check if unavailable
  }

  return { ok: true, width: w, height: h };
}
