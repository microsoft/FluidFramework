import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { IDocumentStorageManager } from "./standardDocumentStorageManager";

export class NoopDocumentStorageManager implements IDocumentStorageManager {
    private static readonly notSupportedMessage = "Method not supported.";
    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public async getBlob(blobid: string): Promise<resources.IBlob> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public async getContent(version: api.IVersion, path: string): Promise<resources.IBlob> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public getRawUrl(blobid: string): string {
        return "";
    }
    public async getTree(version: api.IVersion): Promise<resources.ITree> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public async getVersions(blobid: string, count: number): Promise<api.IVersion[]> {
        return[];
    }
    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
}
