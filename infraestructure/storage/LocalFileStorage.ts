import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorage, FileToStore, StoredFileContent } from '../../application';
import { NotFoundError } from '../../domain';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
const MIME_BY_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime]),
);

/**
 * Guarda archivos en disco bajo `baseDir`. El nombre se genera (UUID) y la extensión sale del MIME,
 * nunca del nombre original, para evitar nombres maliciosos. Las rutas devueltas son relativas.
 */
export class LocalFileStorage implements FileStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  async save(folder: string, file: FileToStore): Promise<string> {
    const extension = EXTENSION_BY_MIME[file.mimeType] ?? 'bin';
    const relativePath = path.posix.join(folder, `${randomUUID()}.${extension}`);
    const absolutePath = this.resolveInside(relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content);
    return relativePath;
  }

  async read(relativePath: string): Promise<StoredFileContent> {
    try {
      const content = await readFile(this.resolveInside(relativePath));
      const extension = path.extname(relativePath).slice(1).toLowerCase();
      return { content, mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError('Archivo no encontrado', 'FILE_NOT_FOUND', { path: relativePath });
      }
      throw error;
    }
  }

  async delete(relativePath: string): Promise<void> {
    await rm(this.resolveInside(relativePath), { force: true });
  }

  /** Impide salir de baseDir con rutas como "../../etc/passwd". */
  private resolveInside(relativePath: string): string {
    const absolutePath = path.resolve(this.baseDir, relativePath);
    if (!absolutePath.startsWith(this.baseDir + path.sep)) {
      throw new NotFoundError('Archivo no encontrado', 'FILE_NOT_FOUND', { path: relativePath });
    }
    return absolutePath;
  }
}
