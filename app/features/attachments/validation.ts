export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_ATTACHMENT_BYTES = 1024 * 1024 * 1024;
export const MAX_ATTACHMENT_NAME_LENGTH = 240;

export function normalizeAttachmentName(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f\\/]/g, "_").trim();
  if (!normalized) return "未命名附件";
  return normalized.slice(0, MAX_ATTACHMENT_NAME_LENGTH);
}

export function validateAttachmentSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error("附件不能为空。");
  if (size > MAX_ATTACHMENT_BYTES) throw new Error("单个附件不能超过 20 MB。");
}

export function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
