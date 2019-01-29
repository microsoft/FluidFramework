import { IDocumentStorageService } from "@prague/runtime-definitions";

// TODO remove once is on runtime utils
export async function readAndParse<T>(storage: IDocumentStorageService, sha: string): Promise<T> {
    const encoded = await storage.read(sha);
    const decoded = Buffer.from(encoded, "base64").toString();
    return JSON.parse(decoded) as T;
}
