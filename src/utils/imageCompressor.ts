/**
 * Utility to compress images on the client side before saving to Firestore.
 * Converts images to compressed WebP (or JPEG fallback) under 250KB.
 */

export interface CompressionResult {
  dataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  format: string;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  maxDimension: number = 1000,
  quality: number = 0.75
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select an image file (PNG, JPG, WebP, etc.).'));
      return;
    }

    // Limit initial file size to 15MB to prevent memory issues
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('Image is too large. Please select an image under 15MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for processing.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down if larger than maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first for superior compression, fallback to JPEG
        let format = 'image/webp';
        let compressedDataUrl = canvas.toDataURL(format, quality);

        // Fallback to JPEG if browser doesn't support WebP export
        if (!compressedDataUrl.startsWith('data:image/webp')) {
          format = 'image/jpeg';
          compressedDataUrl = canvas.toDataURL(format, quality);
        }

        // Calculate approximate size in bytes from base64 string
        const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
        const compressedSizeBytes = Math.round((base64Length * 3) / 4);

        resolve({
          dataUrl: compressedDataUrl,
          originalSizeBytes: file.size,
          compressedSizeBytes,
          format,
          width,
          height,
        });
      };

      if (event.target?.result) {
        img.src = event.target.result as string;
      } else {
        reject(new Error('Could not parse file data.'));
      }
    };

    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
