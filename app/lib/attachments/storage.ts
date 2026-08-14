import "server-only";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

export interface AttachmentStorage {
  write(storageKey: string, data: Uint8Array): Promise<void>;
  read(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
}

function attachmentRoot(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.ATTACHMENT_ROOT || "/data/attachments");
}

function resolveStoragePath(storageKey: string): string {
  if (!/^[a-f0-9-]+\/[a-f0-9-]+$/.test(storageKey)) throw new Error("附件存储键无效。");
  const root = attachmentRoot();
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("附件存储路径无效。");
  return resolved;
}

class LocalAttachmentStorage implements AttachmentStorage {
  async write(storageKey: string, data: Uint8Array): Promise<void> {
    const target = resolveStoragePath(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.uploading`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    await handle.close();
    await rename(temporary, target);
  }

  read(storageKey: string): Promise<Uint8Array> {
    return readFile(/* turbopackIgnore: true */ resolveStoragePath(storageKey));
  }

  remove(storageKey: string): Promise<void> {
    return rm(resolveStoragePath(storageKey), { force: true });
  }
}

export const attachmentStorage: AttachmentStorage = new LocalAttachmentStorage();
