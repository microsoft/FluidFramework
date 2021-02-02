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
    ITree,
} from "@fluidframework/protocol-definitions";
import {
    assert,
    bufferToString,
    stringToBuffer,
    unreachableCase,
    fromUtf8ToBase64,
 } from "@fluidframework/common-utils";

 /**
  * Class responsible for aggregating smaller blobs into one and unpacking it later on.
  */
class BlobAggregator {
    private readonly content: [string, string][]= [];

    public addBlob(key: string, content: string) {
        this.content.push([key, content]);
    }

    public getContent() {
        if (this.content.length === 0) {
            return undefined;
        }
        return JSON.stringify(this.content);
    }

    static load(input: ArrayBufferLike) {
        const data = bufferToString(input, "utf-8");
        return JSON.parse(data) as [string, string][];
    }
}

/*
 * Base class that deals with unpacking snapshots (in place) containing aggregated blobs
 * It relies on abstract methods for reads and storing unpacked blobs.
 */
abstract class SnapshotExtractor {
    protected readonly aggregatedBlobName = "__big";
    protected readonly virtualIdPrefix = "__";

    // counter for generation of virtual storage IDs
    protected virtualIdCounter = 0;
    protected getNextVirtualId() {
        return `${this.virtualIdPrefix}${++this.virtualIdCounter}`;
    }

    abstract getBlob(id: string, tree: ISnapshotTree): Promise<ArrayBufferLike>;
    abstract setBlob(id: string, tree: ISnapshotTree, content: string);

    public async unpackSnapshotCore(snapshot: ISnapshotTree, level = 0): Promise<void> {
        // for now only working at data store level, i.e.
        // .app/DataStore/...
        if (level >= 2) {
            return;
        }

        for (const key of Object.keys(snapshot.trees)) {
            const obj = snapshot.trees[key];
            await this.unpackSnapshotCore(obj, level + 1);
        }
        const blobId = snapshot.blobs[this.aggregatedBlobName];
        if (blobId !== undefined) {
            const blob = await this.getBlob(blobId, snapshot);
            for (const [key, value] of BlobAggregator.load(blob)) {
                const id = this.getNextVirtualId();
                this.setBlob(id, snapshot, value);
                const path = key.split("/");
                let subTree = snapshot;
                for (const subPath of path.slice(0, path.length - 1)) {
                    if (subTree.trees[subPath] === undefined) {
                        subTree.trees[subPath] = { blobs: {}, commits: {}, trees: {}};
                    }
                    subTree = subTree.trees[subPath];
                }
                const name = path[path.length - 1];
                assert(subTree.blobs[name] === undefined);
                subTree.blobs[name] = id;
            }
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete snapshot.blobs[this.aggregatedBlobName];
        }
    }
}

/*
 * Snapshot extractor class that works in place, i.e. patches snapshot that has
 * blob content in ISnapshotTree.blobs itself, not in storage.
 * AS result, it implements reading and writing of blobs to/from snapshot itself.
 */
class SnapshotExtractorInPlace extends SnapshotExtractor {
    public async getBlob(id: string, tree: ISnapshotTree): Promise<ArrayBufferLike> {
        const blob = tree.blobs[id];
        assert(blob !== undefined);
        return stringToBuffer(blob, "base64");
    }

    public setBlob(id: string, tree: ISnapshotTree, content: string) {
        assert(tree.blobs[id] === undefined);
        tree.blobs[id] = fromUtf8ToBase64(content);
    }
}

/*
 * Snapshot packer and extractor.
 * When summary is written it will find and aggregate small blobs into bigger blobs
 * When snapshot is read, it will unpack aggregated blobs and provide them transparently to caller.
 */
export class BlobAggregatorStorage extends SnapshotExtractor implements IDocumentStorageService {
    protected readonly blobCutOffSize = 1024;

    protected loadedFromSummary = false;

    protected virtualBlobs = new Map<string, ArrayBufferLike>();

    static wrap(storage: IDocumentStorageService) {
        if (storage instanceof BlobAggregatorStorage) {
            return storage;
        }
        return new BlobAggregatorStorage(storage);
    }

    static async unpackSnapshot(snapshot: ISnapshotTree) {
        const converter = new SnapshotExtractorInPlace();
        await converter.unpackSnapshotCore(snapshot);
    }

    public async unpackSnapshot(snapshot: ISnapshotTree) {
        assert(!this.loadedFromSummary);
        this.loadedFromSummary = true;
        await this.unpackSnapshotCore(snapshot);
    }

    protected constructor(private readonly storage: IDocumentStorageService) {
        super();
    }

    public setBlob(id: string, tree: ISnapshotTree, content: string) {
        this.virtualBlobs.set(id, stringToBuffer(content, "utf-8"));
    }

    public async getBlob(id: string, tree: ISnapshotTree): Promise<ArrayBufferLike> {
        return this.readBlob(id);
    }

    public get repositoryUrl() { return this.storage.repositoryUrl; }
    public async getVersions(versionId: string | null, count: number) {
        return this.storage.getVersions(versionId, count);
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        throw new Error("NYI");
    }

    // This is only used through Container.snapshot() for testing purposes
    public async write(root: ITree, parents: string[], message: string, ref: string) {
        return this.storage.write(root, parents, message, ref);
    }

    // for now we are not optimizing these blobs, with assumption that this API is used only
    // for big blobs (images)
    public async createBlob(file: ArrayBufferLike) { return this.storage.createBlob(file); }

    public async read(id: string): Promise<string> {
        const blob = await this.readBlob(id);
        return bufferToString(blob, "base64");
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const tree = await this.storage.getSnapshotTree(version);
        if (tree) {
            await this.unpackSnapshot(tree);
        }
        return tree;
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
        assert(this.loadedFromSummary, "never read summary");
        const blob = this.virtualBlobs.get(id);
        assert(blob !== undefined, "virtual blob not found");
        return blob;
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const summaryNew = await this.compressSmallBlobs(summary, "", 0);
        return this.storage.uploadSummaryWithContext(summaryNew, context);
    }

    // For simplification, we assume that
    // - blob aggregation is done at data store level only for now
    // - data store either reuses previous summary, or generates full summary, i.e. there is no partial (some DDS)
    // summary produced by data stores.
    // These simplifications allow us not to touch handles, as they are self-contained (either do not use aggregated
    // blob Or contain aggregated blob that stays relevant for that sub-tree)
    protected async compressSmallBlobs(
        summary: ISummaryTree,
        path: string,
        level: number,
        statsArg?: BlobAggregator): Promise<ISummaryTree>
    {
        // Only pack at data store level.
        const startingLevel = level === 1;

        let stats = statsArg;
        if (startingLevel) {
            assert(stats === undefined);
            stats = new BlobAggregator();
        }

        const newSummary: ISummaryTree = {...summary};
        for (const key of Object.keys(newSummary.tree)) {
            const obj = newSummary.tree[key];
            // Get path relative to root of data store (where we do aggregation)
            const newPath = startingLevel ? key : `${path}/${key}`;
            switch (obj.type) {
                case SummaryType.Tree:
                    // If client created empty tree, keep it as is
                    if (obj.tree !== {}) {
                        const tree = await this.compressSmallBlobs(obj, newPath, level + 1, stats);
                        newSummary.tree[key] = tree;
                        if (tree.tree === {}) {
                            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                            delete newSummary.tree[key];
                        }
                    }
                    break;
                case SummaryType.Blob:
                    if (stats && typeof obj.content == "string" && obj.content.length < this.blobCutOffSize) {
                        stats.addBlob(newPath, obj.content);
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                        delete newSummary.tree[key];
                    }
                    break;
                case SummaryType.Handle:
                    switch (obj.handleType) {
                        case SummaryType.Tree:
                            // Need to expand the tree
                            // But see simplification above - we can avoid it for now
                            break;
                        case SummaryType.Blob:
                        case SummaryType.Attachment:
                            // TODO: need to parse and ensure it's real ID.
                            // assert(this.isRealStorageId(obj.handle));
                            break;
                        default:
                            unreachableCase(obj.handleType, `Unknown type: ${(obj as any).handleType}`);
                    }
                    break;
                case SummaryType.Attachment:
                    assert(this.isRealStorageId(obj.id));
                    break;
                default:
                    unreachableCase(obj, `Unknown type: ${(obj as any).type}`);
            }
        }

        assert(newSummary.tree[this.aggregatedBlobName] === undefined);
        if (startingLevel) {
            assert(stats !== undefined);
            const content = stats.getContent();
            if (content !== undefined) {
                newSummary.tree[this.aggregatedBlobName] = {
                    type: SummaryType.Blob,
                    content,
                };
            }
        }
        return newSummary;
    }

    protected isRealStorageId(id: string): boolean {
        return !id.startsWith(this.virtualIdPrefix);
    }
}
