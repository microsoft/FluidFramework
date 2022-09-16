/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/datastore-definitions";
import {
    ITelemetryContext,
    ISummaryTreeWithStats,
    IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { Index, SummaryElement, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { cachedValue, ICachedValue, recordDependency } from "../dependency-tracking";
import { Delta } from "../tree";
import { StoredSchemaRepository } from "../schema-stored";

/**
 * The storage key for the blob in the summary containing schema data
 */
const schemaBlobKey = "SchemaBlob";

/**
 * Index which tracks stored schema for the current state for the document.
 *
 * Maintains the schema in memory.
 *
 * Used to capture snapshots of schema for summaries, as well as for anything else needing access to stored schema.
 */
export class SchemaIndex implements Index<unknown>, SummaryElement {
    public readonly key = "Schema";

    public readonly summaryElement?: SummaryElement = this;

    private readonly schemaBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;

    public constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly schema: StoredSchemaRepository) {
        this.schemaBlob = cachedValue(async (observer) => {
            recordDependency(observer, this.schema);
            const schemaText = this.getSchemaString();

            // For now we are not chunking the the schema, but still put it in a reusable blob:
            return this.runtime.uploadBlob(IsoBuffer.from(schemaText));
        });
    }

    newLocalState(changeDelta: Delta.Root): void {
        // TODO: apply schema changes.
        // Extend delta to include them, or maybe have some higher level edit type that includes them and deltas?
    }

    /**
     * Synchronous monolithic summarization of schema content.
     *
     * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
     *
     * @returns a snapshot of the forest schema as a string.
     */
     private getSchemaString(): string {
        const { treeSchema, globalFieldSchema } = this.schema;
        return `TODO: actual format ${treeSchema}, ${globalFieldSchema}`;
    }

    public getAttachSummary(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats {
        return this.summarizeCore(stringify, this.getSchemaString());
    }

    public async summarize(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats> {
        const schemaBlobHandle = await this.schemaBlob.get();
        return this.summarizeCore(stringify, schemaBlobHandle);
    }

    private summarizeCore(
        stringify: SummaryElementStringifier,
        schema: string | IFluidHandle<ArrayBufferLike>,
    ): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        const serializedSchemaBlobHandle = stringify(schema);
        builder.addBlob(schemaBlobKey, serializedSchemaBlobHandle);
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
        if (await services.contains(schemaBlobKey)) {
            // const schemaBuffer = await services.readBlob(schemaBlobKey);
            // TODO: use schema to initialize this.schema
            // const schema = parse(bufferToString(_schemaBuffer, "utf8")) as string;
            throw new Error("Method not implemented.");
        }
    }
}
