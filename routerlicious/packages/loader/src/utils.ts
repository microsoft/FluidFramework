import { IDocumentStorageService } from "@prague/runtime-definitions";

export async function readAndParse<T>(storage: IDocumentStorageService, sha: string): Promise<T> {
    const encoded = await storage.read(sha);
    const decoded = Buffer.from(encoded, "base64").toString();
    // tslint:disable-next-line
    return JSON.parse(decoded);
}
