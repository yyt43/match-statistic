/// <reference lib="webworker" />

interface ImageEncodeRequest {
  id: string;
  bitmap: ImageBitmap;
}

self.onmessage = async (event: MessageEvent<ImageEncodeRequest>) => {
  const { id, bitmap } = event.data;

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2D context is unavailable.');

    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, blob });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap.close();
  }
};
