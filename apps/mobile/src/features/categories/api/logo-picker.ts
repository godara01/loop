/**
 * Picking and preparing a category logo: pick → crop to a centred square →
 * resize to `LOGO_DIMENSION` → hand back a local file ready to upload.
 *
 * Kept separate from `category-repository.ts` because this half touches
 * `expo-image-picker`/`expo-image-manipulator`, not Firebase — but it is just
 * as native and just as impure, so it lives in `api/` for the same reason.
 */

import { LOGO_DIMENSION, validateLogoFile } from '@loop/shared';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type LogoPickResult =
  | { readonly status: 'picked'; readonly localUri: string; readonly mimeType: string; readonly size: number }
  | { readonly status: 'canceled' }
  | { readonly status: 'rejected'; readonly reason: 'too_large' | 'wrong_type' };

/**
 * Opens the system picker, crops whatever comes back to a centred square, and
 * resizes it down to `LOGO_DIMENSION`. The crop rect is computed from the
 * picked asset's own reported dimensions — cropping before resizing is what
 * keeps a non-square photo from being squashed.
 */
export async function pickCategoryLogo(): Promise<LogoPickResult> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    allowsEditing: false, // We crop ourselves — a fixed square, not whatever aspect the OS editor offers.
  });
  if (picked.canceled || picked.assets.length === 0) return { status: 'canceled' };

  const asset = picked.assets[0]!;
  const side = Math.min(asset.width, asset.height);
  const originX = Math.round((asset.width - side) / 2);
  const originY = Math.round((asset.height - side) / 2);

  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri)
    .crop({ originX, originY, width: side, height: side })
    .resize({ width: LOGO_DIMENSION, height: LOGO_DIMENSION });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 });

  // `new File(uri)` reads real filesystem metadata — reliable, unlike sniffing
  // size off a fetch()'d Blob for a local file, which is flaky on RN/Hermes.
  const file = new File(saved.uri);
  const mimeType = file.type ?? 'image/jpeg';

  const problem = validateLogoFile({ size: file.size, mimeType });
  if (problem) return { status: 'rejected', reason: problem };

  return { status: 'picked', localUri: saved.uri, mimeType, size: file.size };
}
