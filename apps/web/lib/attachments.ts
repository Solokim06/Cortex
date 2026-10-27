/**
 * File attachment helpers — validation, size limits, icons, formatting.
 */

// Supported extensions (mirrors backend extract.py)
export const SUPPORTED_EXTENSIONS = {
  text: [".txt", ".md", ".markdown", ".log", ".csv", ".json", ".yaml", ".yml"],
  pdf: [".pdf"],
  docx: [".docx"],
  spreadsheet: [".xlsx", ".xls"],
  image: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".heic", ".heif"],
  audio: [".m4a", ".mp3", ".wav", ".webm", ".ogg", ".flac", ".aac", ".opus"],
  video: [".mp4", ".mov", ".m4v", ".mkv"],
} as const;

// Max sizes per category (mirrors backend limits)
export const MAX_FILE_SIZES: Record<string, number> = {
  text: 20 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  docx: 25 * 1024 * 1024,
  spreadsheet: 25 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

// Accept string for <input type="file">
export const ACCEPT_STRING = Object.values(SUPPORTED_EXTENSIONS)
  .flat()
  .join(",");

export type FileCategory = keyof typeof SUPPORTED_EXTENSIONS;

export function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return filename.slice(dotIndex).toLowerCase();
}

export function getFileCategory(filename: string): FileCategory | null {
  const ext = getFileExtension(filename);
  if (!ext) return null;

  for (const [category, extensions] of Object.entries(SUPPORTED_EXTENSIONS)) {
    if ((extensions as readonly string[]).includes(ext)) {
      return category as FileCategory;
    }
  }
  return null;
}

export function getMaxSizeForFile(filename: string): number {
  const category = getFileCategory(filename);
  if (!category) return 0;
  return MAX_FILE_SIZES[category] || 0;
}

export type FileValidation = {
  valid: boolean;
  error?: string;
  category?: FileCategory;
};

export function validateFile(file: File): FileValidation {
  const category = getFileCategory(file.name);

  if (!category) {
    return {
      valid: false,
      error: `Unsupported file type. Try: PDF, DOCX, XLSX, images, audio, video, or text.`,
    };
  }

  const maxSize = MAX_FILE_SIZES[category];
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    return {
      valid: false,
      error: `File too large (${formatFileSize(file.size)}). Max for ${category} is ${maxMB} MB.`,
      category,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: "File is empty.",
      category,
    };
  }

  return { valid: true, category };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getFileIconType(category: FileCategory | null): string {
  return category || "unknown";
}
