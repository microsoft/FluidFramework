import * as resources from "@prague/gitresources";
import * as api from "@prague/runtime-definitions";
import { IDocumentStorageManager } from "./standardDocumentStorageManager";

export class NoopDocumentStorageManager implements IDocumentStorageManager {
    private static readonly notSupportedMessage = "Method not supported.";
    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public async getBlob(blobid: string): Promise<resources.IBlob> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public async getContent(version: resources.ICommit, path: string): Promise<resources.IBlob> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public getRawUrl(blobid: string): string {
        return "";
    }
    public async getTree(version: resources.ICommit): Promise<resources.ITree> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
    public async getVersions(blobid: string, count: number): Promise<resources.ICommit[]> {
        return[];
    }
    public async write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit> {
        throw new Error(NoopDocumentStorageManager.notSupportedMessage);
    }
}
