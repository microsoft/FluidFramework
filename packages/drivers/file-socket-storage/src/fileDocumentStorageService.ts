import * as api from "@prague/container-definitions";
import * as fs from "fs";
import * as util from "util";

/**
 * Document storage service for the file driver...just does a default implememtation for
 * all the methods
 */
export class FileDocumentStorageService implements api.IDocumentStorageService  {
    private static snapshotNumber = 0;

    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        return null;
    }

    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
       return [];
    }

    public async read(id: string): Promise<string> {
        return "";
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        return "";
    }

    public async write(
        tree: api.ITree,
        parents: string[],
        message: string,
        ref: string): Promise<api.IVersion | null> {
            const version: api.IVersion = {
                id: `${FileDocumentStorageService.snapshotNumber}`,
                treeId: "",
            };

            const writeFile = util.promisify(fs.writeFile);
            await writeFile(
                `./Snaphot_${FileDocumentStorageService.snapshotNumber}.json`,
                JSON.stringify(tree, undefined, 2));
            FileDocumentStorageService.snapshotNumber += 1;
            console.log("writing snapshot_", FileDocumentStorageService.snapshotNumber);
            return version;
    }

    public uploadSummary(commit: api.ISummaryCommit): Promise<api.ISummaryPackfileHandle> {
        return Promise.reject("Method not implemented.");
    }

    public downloadSummary(handle: api.ISummaryPackfileHandle): Promise<api.ISummaryCommit> {
        return Promise.reject("Method not implemented.");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse | null> {
        return null;
    }

    public getRawUrl(blobId: string): string | null {
        return null;
    }
}
