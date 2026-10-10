import * as ImagePicker from 'expo-image-picker';

import { API_BASE_URL } from '../config';

/**
 * Open the OS image picker, upload the chosen image to the backend's /decode
 * endpoint, and return the QR payload the backend extracted. `null` when the
 * user cancelled; throws when no QR was found or on network error.
 *
 * We send the image as base64 JSON (not multipart/form-data) because iOS
 * React Native's FormData implementation chokes on file parts with
 * "unsupported FormDataPart" in Expo Go. Base64 is ~33% larger on the wire
 * but works on every platform the same way.
 */
export async function pickAndDecodeQr(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (!asset.base64) {
    throw new Error('Could not read image data.');
  }

  const res = await fetch(`${API_BASE_URL}/decode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      image: asset.base64,
      mime: asset.mimeType ?? 'image/jpeg',
    }),
  });
  if (res.status === 404) {
    throw new Error('No QR code found in that image.');
  }
  if (!res.ok) {
    throw new Error(`Decode failed (${res.status}).`);
  }
  const data = (await res.json()) as { data: string };
  return data.data;
}
