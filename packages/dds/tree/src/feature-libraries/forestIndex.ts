/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ISummaryAttachment, ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import {
    ITelemetryContext,
    ISummaryTreeWithStats,
    IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import {
    IEditableForest, ITreeSubscriptionCursor, TreeNavigationResult,
} from "../forest";
import { Index, SummaryElement } from "../shared-tree-core";
import { cachedValue, ICachedValue, recordDependency } from "../dependency-tracking";
import { Delta } from "../changeset";
import { ObjectForest } from "./object-forest";
import { PlaceholderTree, placeholderTreeFromCursor, TextCursor } from "./treeTextFormat";

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
    private readonly forest: IEditableForest = new ObjectForest();

    // TODO: implement this to provide snapshots in summaries.
    readonly summaryElement?: SummaryElement = this;

    private readonly cursor: ITreeSubscriptionCursor;

    // Note that if invalidation happens when these promises are running, you may get stale results.
    private readonly treeBlob: ICachedValue<Promise<ISummaryAttachment>>;
    private readonly schemaBlob: ICachedValue<Promise<ISummaryAttachment>>;

    public constructor(private readonly runtime: IFluidDataStoreRuntime) {
        this.cursor = this.forest.allocateCursor();
        this.treeBlob = cachedValue(async (observer) => {
            // TODO: could optimize to depend on tree only, not also schema.
            recordDependency(observer, this.forest);
            const treeText = this.getTreeString();

            // For now we are not chunking the data, and instead put it in a single blob:
            const blob = await this.runtime.uploadBlob(IsoBuffer.from(treeText));
            return { type: SummaryType.Attachment, id: idFromBlob(blob) };
        });
        this.schemaBlob = cachedValue(async (observer) => {
            recordDependency(observer, this.forest.schema);
            const schemaText = this.getSchemaString();

            // For now we are not chunking the the schema, but still put it in a reusable blob:
            const blob = await this.runtime.uploadBlob(IsoBuffer.from(schemaText));
            return { type: SummaryType.Attachment, id: idFromBlob(blob) };
        });
    }

    newLocalState(changeDelta: Delta.Root): void {
        // TODO: apply changeDelta to the forest.
        // TODO: unity this with logic in transaction.
        throw new Error("Method not implemented.");
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
        const roots: PlaceholderTree[] = [];
        let result = this.forest.tryGet(rootAnchor, this.cursor);
        while (result === TreeNavigationResult.Ok) {
            roots.push(placeholderTreeFromCursor(this.cursor));
            result = this.cursor.seek(1).result;
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

    getAttachSummary(
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats {
        // Synchronously generate a simple summary:
        const tree: ISummaryBlob = { type: SummaryType.Blob, content: this.getTreeString() };
        const schema: ISummaryBlob = { type: SummaryType.Blob, content: this.getSchemaString() };
        return {
            stats: {
                treeNodeCount: 1,
                handleNodeCount: 0,
                blobNodeCount: 1,
                totalBlobSize: tree.content.length,
                unreferencedBlobSize: 0,
            },
            summary: {
                type: SummaryType.Tree,
                tree: { schema, tree },
            },
        };
    }

    async summarize(
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats> {
        const tree: ISummaryAttachment = await this.treeBlob.get();
        const schema: ISummaryAttachment = await this.schemaBlob.get();
        return {
            stats: {
                treeNodeCount: 1,
                handleNodeCount: 0,
                blobNodeCount: 0,
                // TODO:
                // I think this refers to the total size of ISummaryBlobs, not ISummaryAttachment blobs.
                // Also, it seems off ISummaryAttachments are not counted in stats: determine what is up with this.
                totalBlobSize: 0,
                unreferencedBlobSize: 0,
            },
            summary: {
                type: SummaryType.Tree,
                tree: { schema, tree },
            },
        };
    }

    getGCData(fullGC?: boolean): IGarbageCollectionData {
        throw new Error("Method not implemented.");
    }

    async loadCore(services: IChannelStorageService): Promise<void> {
        // TODO: does this handle both ISummaryAttachment and ISummaryBlob cases?
        const [schemaBuffer, treeBuffer] = await Promise.all([services.readBlob("schema"), services.readBlob("tree")]);
        const decodedSchema = bufferToString(schemaBuffer, "utf8");
        const decodedtree = bufferToString(treeBuffer, "utf8");

        const placeholderTree = JSON.parse(decodedtree) as PlaceholderTree[];

        // TODO: maybe assert forest is empty?
        const range = this.forest.add(placeholderTree.map((t) => new TextCursor(t)));
        const dst = { index: 0, range: this.forest.rootField };
        this.forest.attachRangeOfChildren(dst, range);

        // TODO: use decodedSchema to initialize forest.schema
        throw new Error("Method not implemented.");
        throw new Error(decodedSchema);
    }
}

function idFromBlob(blob: IFluidHandle<ArrayBufferLike>): string {
    // TODO: figure out how you get an id from a blob.
    throw new Error("Method not implemented.");
}
