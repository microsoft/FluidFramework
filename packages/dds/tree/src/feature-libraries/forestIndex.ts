/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/datastore-definitions";
import {
    ITelemetryContext,
    ISummaryTreeWithStats,
    IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import {
    IEditableForest, initializeForest, ITreeSubscriptionCursor, TreeNavigationResult,
} from "../forest";
import { Index, SummaryElement, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { cachedValue, ICachedValue, recordDependency } from "../dependency-tracking";
import { JsonableTree, Delta } from "../tree";
import { jsonableTreeFromCursor } from "./treeTextCursorLegacy";
import { singleTextCursor } from "./treeTextCursor";

/**
 * The storage key for the blob in the summary containing tree data
 */
const treeBlobKey = "ForestTree";

/**
 * Index which provides an editable forest for the current state for the document.
 *
 * Maintains part of the document in memory, but can fetch more on demand.
 *
 * TODO: support for partial checkouts.
 *
 * Used to capture snapshots of document for summaries.
 */
export class ForestIndex implements Index<unknown>, SummaryElement {
    public readonly key = "Forest";

    public readonly summaryElement?: SummaryElement = this;

    private readonly cursor: ITreeSubscriptionCursor;

    // Note that if invalidation happens when these promises are running, you may get stale results.
    private readonly treeBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;

    public constructor(private readonly runtime: IFluidDataStoreRuntime, private readonly forest: IEditableForest) {
        this.cursor = this.forest.allocateCursor();
        this.treeBlob = cachedValue(async (observer) => {
            // TODO: could optimize to depend on tree only, not also schema.
            recordDependency(observer, this.forest);
            const treeText = this.getTreeString();

            // For now we are not chunking the data, and instead put it in a single blob:
            // TODO: use lower level API to avoid blob manager?
            return this.runtime.uploadBlob(IsoBuffer.from(treeText));
        });
    }

    newLocalState(changeDelta: Delta.Root): void {
        this.forest.applyDelta(changeDelta);
    }

    /**
     * Synchronous monolithic summarization of tree content.
     *
     * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
     *
     * @returns a snapshot of the forest's tree as a string.
     */
    private getTreeString(): string {
        // TODO: maybe assert there are no other roots
        // (since we don't save them, and they should not exist outside transactions).
        const rootAnchor = this.forest.root(this.forest.rootField);
        const roots: JsonableTree[] = [];
        let result = this.forest.tryMoveCursorTo(rootAnchor, this.cursor);
        while (result === TreeNavigationResult.Ok) {
            roots.push(jsonableTreeFromCursor(this.cursor));
            result = this.cursor.seek(1);
        }
        this.cursor.clear();
        assert(result === TreeNavigationResult.NotFound, 0x34b /* Unsupported navigation result */);

        return JSON.stringify(roots);
    }

    public getAttachSummary(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats {
        return this.summarizeCore(stringify, this.getTreeString());
    }

    public async summarize(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats> {
        const treeBlobHandle = await this.treeBlob.get();
        return this.summarizeCore(stringify, treeBlobHandle);
    }

    private summarizeCore(
        stringify: SummaryElementStringifier,
        tree: string | IFluidHandle<ArrayBufferLike>,
    ): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        const serializedTreeBlobHandle = stringify(tree);
        builder.addBlob(treeBlobKey, serializedTreeBlobHandle);
        return builder.getSummaryTree();
    }

    public getGCData(fullGC?: boolean): IGarbageCollectionData {
        // TODO: Properly implement garbage collection. Right now, garbage collection is performed automatically
        // by the code in SharedObject (from which SharedTreeCore extends). The `runtime.uploadBlob` API delegates
        // to the `BlobManager`, which automatically populates the summary with ISummaryAttachment entries for each
        // blob.
        return {
            gcNodes: {},
        };
    }

    public async load(services: IChannelStorageService, parse: SummaryElementParser): Promise<void> {
        if (await services.contains(treeBlobKey)) {
            const treeBuffer = await services.readBlob(treeBlobKey);
            const treeBufferString = bufferToString(treeBuffer, "utf8");
            const tree = parse(treeBufferString) as string;
            const jsonableTree = JSON.parse(tree) as JsonableTree[];
            initializeForest(this.forest, jsonableTree.map(singleTextCursor));
        }
    }
}
