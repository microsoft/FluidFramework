/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 import {
     IDocumentStorageService,
     ISummaryContext,
} from "@fluidframework/driver-definitions";
 import {
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    IVersion,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { assert, bufferToString, unreachableCase } from "@fluidframework/common-utils";

 export class BlobAggregatorStorage implements IDocumentStorageService {
    protected originalSummary: ISnapshotTree | null = null;

    public constructor(private readonly storage: IDocumentStorageService) {}

    public get repositoryUrl() { return this.storage.repositoryUrl; }
    public async getVersions(...args: any[]) { return this.storage.getVersions(...args); }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        throw new Error("NYI");
    }

    // This is only used through Container.snapshot() for testing purposes
    public async write(...args: any[]) { return this.storage.write(...args); }

    // for now we are not optimizing these blobs, with assumption that this API is used only
    // for big blobs (images)
    public async createBlob(...args: any[]) { return this.storage.createBlob(...args); }

    public async read(id: string): Promise<string> {
        const blob = await this.readBlob(id);
        return bufferToString(blob, "utf-8");
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        assert(!this.originalSummary, "supporting only loading one summary");
        this.originalSummary = await this.storage.getSnapshotTree(version);

        return this.originalSummary;
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        if (this.isRealStorageId(id)) {
            return this.storage.readBlob(id);
        }
        // We support only reading blobs from the summary we loaded from.
        // This may need to be extended to any general summary in the future as runtime usage pattern
        // of storage changes (for example, data stores start to load from recent summary, not from original
        // summary whole container loaded from)

        // are there other ways we can get here? createFile is one flow, but we should not be reading blobs
        // in such flow
        assert(!this.originalSummary, "never read summary");
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const summaryNew = await this.unpackSummary(summary);
        return this.storage.uploadSummaryWithContext(summaryNew, context);
    }

    protected async unpackSummary(summary: ISummaryTree): Promise<ISummaryTree> {
        const newSummary = {...summary};
        for (const key of Object.keys(newSummary)) {
            const obj = newSummary.tree[key];
            switch (obj.type) {
                case SummaryType.Tree:
                    newSummary.tree[key] = await this.unpackSummary(obj);
                    break;
                case SummaryType.Blob:
                    break;
                case SummaryType.Handle:
                    switch (obj.handleType) {
                        case SummaryType.Tree:
                            // Need to expand the tree
                            break;
                        case SummaryType.Blob:
                            // need to figure out if this is storage blob or not and expand it.
                            break;
                        case SummaryType.Attachment:
                            assert(this.isRealStorageId(obj.id));
                            break;
                        default:
                            unreachableCase(obj, `Unknown type: ${(obj as any).handleType}`);
                    }
                    break;
                case SummaryType.Attachment:
                    assert(this.isRealStorageId(obj.id));
                    break;
                default:
                    unreachableCase(obj, `Unknown type: ${(obj as any).type}`);
            }
        }
        return newSummary;
    }

    protected isRealStorageId(id: string): boolean {
        return true;
    }
 }