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

// Gate that when flipped, instructs to compress small blobs.
// We have to first ship with this gate off, such that we can get to saturation bits
// that can understand compressed format. And only after that flip it.
 const gatesAllowPacking = false;

// 2K seems like the sweat spot:
// The smaller the number, less blobs we aggregate. Most storages are very likely to have notion
// of minimal "cluster" size, so having small blobs is wasteful
// At the same time increasing the limit ensure that more blobs with user content are aggregated,
// reducing possibility for de-duping of same blobs (i.e. .attributes rolled into aggregate blob
// are not reused across data stores, or even within data store, resulting in duplication of content)
// Note that duplication of content should not have significant impact for bytes over wire as
// compression of http payload mostly takes care of it, but it does impact storage size and in-memory sizes.
const blobCutOffSize = 2048;

 /**
  * Class responsible for aggregating smaller blobs into one and unpacking it later on.
  */
class BlobAggregator {
    private readonly content: [string, string][]= [];

    public addBlob(key: string, content: string) {
        this.content.push([key, content]);
    }

    public getAggregatedBlobContent() {
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

        // For future proof, we will support multiple aggregated blobs with any name
        // that starts with this.aggregatedBlobName
        for (const key of Object.keys(snapshot.blobs)) {
            if (!key.startsWith(this.aggregatedBlobName)) { continue; }
            const blobId = snapshot.blobs[key];
            if (blobId !== undefined) {
                const blob = await this.getBlob(blobId, snapshot);
                for (const [path, value] of BlobAggregator.load(blob)) {
                    const id = this.getNextVirtualId();
                    this.setBlob(id, snapshot, value);
                    const pathSplit = path.split("/");
                    let subTree = snapshot;
                    for (const subPath of pathSplit.slice(0, pathSplit.length - 1)) {
                        if (subTree.trees[subPath] === undefined) {
                            subTree.trees[subPath] = { blobs: {}, commits: {}, trees: {}};
                        }
                        subTree = subTree.trees[subPath];
                    }
                    const blobName = pathSplit[pathSplit.length - 1];
                    assert(subTree.blobs[blobName] === undefined);
                    subTree.blobs[blobName] = id;
                }
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete snapshot.blobs[this.aggregatedBlobName];
            }
        }
    }
}

/*
 * Snapshot extractor class that works in place, i.e. patches snapshot that has
 * blob content in ISnapshotTree.blobs itself, not in storage.
 * As result, it implements reading and writing of blobs to/from snapshot itself.
 * It follows existing pattern that mixes concerns - ISnapshotTree.blobs is used for two
 * purposes:
 * 1. map path name to blob ID
 * 2. map blob ID to blob content
 * #2 is what storage (IDocumentStorageService) is for, but in places where we do not have it
 * (like loading serialized earlier draft content), blob content is put directly into snapshot.
 * Ideally this should be fixed by using BlobCacheStorageService or something similar and
 * fixing existing flows to allow switching of storage.
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
    // Tells data store if it can use incremental summary (i.e. reuse DDSs from previous summary
    // when only one DDS changed).
    // The answer has to be know long before we enable actual packing. The reason for the is the following:
    // A the moment when we enable packing, we should assume that all clients out there wil already have bits
    // that can unpack properly (i.e. enough time passed since we deployed bits that can unpack)
    // But we can still have clients where some of them already pack, and some do not. If one summary was
    // using packing, then it relies on non-incremental summaries going forward, even if next client who
    // produced summary is not packing!
    // This can have slight improvement by enabling it per file (based on "did summary we loaded from contain
    // aggregated blobs"), but that's harder to make reliable, so going for simplicity.
    static readonly fullDataStoreSummaries = true;

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

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const tree = await this.storage.getSnapshotTree(version);
        if (tree) {
            await this.unpackSnapshot(tree);
        }
        return tree;
    }

    public async read(id: string): Promise<string> {
        // optimize it a bit to avoid unneeded conversions while we transition to using readBlob everywhere.
        if (this.isRealStorageId(id)) {
            return this.storage.read(id);
        }
        const blob = await this.readBlob(id);
        return bufferToString(blob, "base64");
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
        const summaryNew = gatesAllowPacking ? await this.compressSmallBlobs(summary) : summary;
        return this.storage.uploadSummaryWithContext(summaryNew, context);
    }

    // For simplification, we assume that
    // - blob aggregation is done at data store level only for now
    // - data store either reuses previous summary, or generates full summary, i.e. there is no partial (some DDS)
    // summary produced by data stores.
    // These simplifications allow us not to touch handles, as they are self-contained (either do not use aggregated
    // blob Or contain aggregated blob that stays relevant for that sub-tree)
    // Note:
    // From perf perspective, it makes sense to place aggregated blobs one level up in the tree not to create extra
    // tree nodes (i.e. have shallow tree with less edges). But that creates problems with reusability of trees at
    // incremental summary time - we would need to understand handles and parse them. In current design we can skip
    // that step because if data store is reused, the hole sub-tree is reused included aggregated blob embedded into it
    // and that means we can do nothing and be correct!
    protected async compressSmallBlobs(
        summary: ISummaryTree,
        path = "",
        level = 0,
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
                    // Also do not package search blobs - they are path of storage contract
                    if (obj.tree !== {} && key !== "__search") {
                        const tree = await this.compressSmallBlobs(obj, newPath, level + 1, stats);
                        newSummary.tree[key] = tree;
                        if (tree.tree === {}) {
                            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                            delete newSummary.tree[key];
                        }
                    }
                    break;
                case SummaryType.Blob:
                    if (stats && typeof obj.content == "string" && obj.content.length < blobCutOffSize) {
                        stats.addBlob(newPath, obj.content);
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                        delete newSummary.tree[key];
                    }
                    break;
                case SummaryType.Handle: {
                    // Would be nice to:
                    // Trees: expand the tree
                    // Blobs: parse handle and ensure it points to real blob, not virtual blob.
                    // We can avoid it for now given data store is the granularity of incremental summaries.
                    let handlePath = obj.handle;
                    if (handlePath.startsWith("/")) {
                        handlePath = handlePath.substr(1);
                    }
                    // Ensure only whole data stores can be reused, no reusing at deeper level!
                    assert(level === 0);
                    assert(handlePath.indexOf("/") === -1, "data stores are writing incremental summaries!");
                    break;
                }
                case SummaryType.Attachment:
                    assert(this.isRealStorageId(obj.id));
                    break;
                default:
                    unreachableCase(obj, `Unknown type: ${(obj as any).type}`);
            }
        }

        assert(newSummary.tree[this.aggregatedBlobName] === undefined);
        if (startingLevel) {
            // Note: It would be great to add code here to unpack aggregate blob back to normal blobs
            // If only one blob made it into aggregate. Currently that does not happen as we always have
            // at least one .component blob and at least one DDS that has .attributes blob, so it's not an issue.
            // But it's possible that in future that would be great addition!
            // Good news - it's backward compatible change.
            assert(stats !== undefined);
            const content = stats.getAggregatedBlobContent();
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
