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
import { jsonableTreeFromCursor } from "./treeTextCursor";

/** The storage key for the blob in the summary containing tree data */
const treeBlobKey = "ForestTree";
/** The storage key for the blob in the summary containing schema data */
const schemaBlobKey = "ForestSchema";

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
    readonly key: string = "Forest";

    readonly summaryElement?: SummaryElement = this;

    private readonly cursor: ITreeSubscriptionCursor;

    // Note that if invalidation happens when these promises are running, you may get stale results.
    private readonly treeBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;
    private readonly schemaBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;

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
        this.schemaBlob = cachedValue(async (observer) => {
            recordDependency(observer, this.forest.schema);
            const schemaText = this.getSchemaString();

            // For now we are not chunking the the schema, but still put it in a reusable blob:
            return this.runtime.uploadBlob(IsoBuffer.from(schemaText));
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
        let result = this.forest.tryGet(rootAnchor, this.cursor);
        while (result === TreeNavigationResult.Ok) {
            roots.push(jsonableTreeFromCursor(this.cursor));
            result = this.cursor.seek(1);
        }
        this.cursor.clear();
        assert(result === TreeNavigationResult.NotFound, "Unsupported navigation result");

        return JSON.stringify(roots);
    }

    /**
     * Synchronous monolithic summarization of schema content.
     *
     * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
     *
     * @returns a snapshot of the forest schema as a string.
     */
     private getSchemaString(): string {
        const { treeSchema, globalFieldSchema } = this.forest.schema;
        throw new Error("Method not implemented.");
        return `TODO: actual format ${treeSchema}, ${globalFieldSchema}`;
    }

    public getAttachSummary(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats {
        return this.summarizeCore(stringify, this.getSchemaString(), this.getTreeString());
    }

    public async summarize(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats> {
        const [schemaBlobHandle, treeBlobHandle] = await Promise.all([this.schemaBlob.get(), this.treeBlob.get()]);
        return this.summarizeCore(stringify, schemaBlobHandle, treeBlobHandle);
    }

    private summarizeCore(
        stringify: SummaryElementStringifier,
        schema: string | IFluidHandle<ArrayBufferLike>,
        tree: string | IFluidHandle<ArrayBufferLike>,
    ): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        const serializedSchemaBlobHandle = stringify(schema);
        builder.addBlob(schemaBlobKey, serializedSchemaBlobHandle);
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
        const [_schemaBuffer, treeBuffer] = await Promise.all([
            services.readBlob(schemaBlobKey),
            services.readBlob(treeBlobKey),
        ]);
        const tree = parse(bufferToString(treeBuffer, "utf8")) as string;
        const placeholderTree = JSON.parse(tree) as JsonableTree[];

        initializeForest(this.forest, placeholderTree);

        // TODO: use schema to initialize forest.schema
        // const schema = parse(bufferToString(_schemaBuffer, "utf8")) as string;
        throw new Error("Method not implemented.");
    }
}
