export interface FileToStore {
  content: Uint8Array;
  originalName: string;
  mimeType: string;
}

export interface StoredFileContent {
  content: Uint8Array;
  mimeType: string;
}

/** Almacenamiento de archivos (comprobantes). Devuelve rutas relativas al almacenamiento. */
export interface FileStorage {
  save(folder: string, file: FileToStore): Promise<string>;
  read(path: string): Promise<StoredFileContent>;
  delete(path: string): Promise<void>;
}
