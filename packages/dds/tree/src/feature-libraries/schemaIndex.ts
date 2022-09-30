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
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { Index, SummaryElement, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { cachedValue, Dependee, Dependent, ICachedValue, recordDependency } from "../dependency-tracking";
import { Delta } from "../tree";
import {
    FieldKindIdentifier, FieldSchema, GlobalFieldKey, LocalFieldKey, Named,
    SchemaData, SchemaPolicy, StoredSchemaRepository, TreeSchema, TreeSchemaIdentifier, ValueSchema,
    schemaDataIsEmpty,
} from "../schema-stored";
import { brand, isJsonObject, JsonCompatibleReadOnly } from "../util";

/**
 * The storage key for the blob in the summary containing schema data
 */
const schemaBlobKey = "SchemaBlob";

const schemaStringKey = "SchemaString";

const version = "1.0.0" as const;

/**
 * Format for encoding as json.
 *
 * For consistency all lists are sorted and undefined values are omitted.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 */
interface Format {
    version: typeof version;
    treeSchema: TreeSchemaFormat[];
    globalFieldSchema: NamedFieldSchemaFormat[];
}

interface TreeSchemaFormat {
    name: TreeSchemaIdentifier;
    localFields: NamedFieldSchemaFormat[];
    globalFields: GlobalFieldKey[];
    extraLocalFields: FieldSchemaFormat;
    extraGlobalFields: boolean;
    value: ValueSchema;
}

type NamedFieldSchemaFormat = FieldSchemaFormat & Named<string>;

interface FieldSchemaFormat {
    kind: FieldKindIdentifier;
    types?: TreeSchemaIdentifier[];
}

function encodeRepo(repo: SchemaData): Format {
    const treeSchema: TreeSchemaFormat[] = [];
    const globalFieldSchema: NamedFieldSchemaFormat[] = [];
    for (const [name, schema] of repo.treeSchema) {
        treeSchema.push(encodeTree(name, schema));
    }
    for (const [name, schema] of repo.globalFieldSchema) {
        globalFieldSchema.push(encodeNamedField(name, schema));
    }
    treeSchema.sort(compareNamed);
    globalFieldSchema.sort(compareNamed);
    return {
        version,
        treeSchema,
        globalFieldSchema,
    };
}

function compareNamed(a: Named<string>, b: Named<string>) {
    if (a.name < b.name) {
      return -1;
    }
    if (a.name > b.name) {
      return 1;
    }
    return 0;
}

function encodeTree(name: TreeSchemaIdentifier, schema: TreeSchema): TreeSchemaFormat {
    const out: TreeSchemaFormat = {
        name,
        extraGlobalFields: schema.extraGlobalFields,
        extraLocalFields: encodeField(schema.extraLocalFields),
        globalFields: [...schema.globalFields].sort(),
        localFields: [...schema.localFields].map(([k, v]) => encodeNamedField(k, v)).sort(compareNamed),
        value: schema.value,
    };
    return out;
}

function encodeField(schema: FieldSchema): FieldSchemaFormat {
    const out: FieldSchemaFormat = {
        kind: schema.kind,
    };
    if (schema.types !== undefined) {
        out.types = [...schema.types];
    }
    return out;
}

function encodeNamedField(name: string, schema: FieldSchema): NamedFieldSchemaFormat {
    return {
        ...encodeField(schema),
        name,
    };
}

function decode(f: Format): SchemaData {
    const globalFieldSchema: Map<GlobalFieldKey, FieldSchema> = new Map();
    const treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
    for (const field of f.globalFieldSchema) {
        globalFieldSchema.set(brand(field.name), decodeField(field));
    }
    for (const tree of f.treeSchema) {
        treeSchema.set(brand(tree.name), decodeTree(tree));
    }
    return {
        globalFieldSchema,
        treeSchema,
    };
}

function decodeField(schema: FieldSchemaFormat): FieldSchema {
    const out: FieldSchema = {
        kind: schema.kind,
        types: schema.types === undefined ? undefined : new Set(schema.types),
    };
    return out;
}

function decodeTree(schema: TreeSchemaFormat): TreeSchema {
    const out: TreeSchema = {
        extraGlobalFields: schema.extraGlobalFields,
        extraLocalFields: decodeField(schema.extraLocalFields),
        globalFields: new Set(schema.globalFields),
        localFields: new Map(
            schema.localFields.map((field): [LocalFieldKey, FieldSchema] => [brand(field.name), decodeField(field)]),
        ),
        value: schema.value,
    };
    return out;
}

/**
 * Synchronous monolithic summarization of schema content.
 *
 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
 *
 * @returns a snapshot of the schema as a string.
 */
export function getSchemaString(data: SchemaData): string {
    const encoded = encodeRepo(data);
    // Currently no Fluid handles are used, so just use JSON.stringify.
    return JSON.stringify(encoded);
}

/**
 * Parses data, asserts format is the current one.
 */
export function parseSchemaString(data: string): SchemaData {
    // Currently no Fluid handles are used, so just use JSON.parse.
    const parsed = JSON.parse(data) as Format;
    assert(parsed.version === version, 0x3d7 /* Got unsupported schema format version */);
    return decode(parsed);
}

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
            const schemaText = getSchemaString(this.schema);

            // For now we are not chunking the the schema, but still put it in a reusable blob:
            return this.runtime.uploadBlob(IsoBuffer.from(schemaText));
        });
    }

    newLocalState(changeDelta: Delta.Root): void {
        // TODO: apply schema changes.
        // Extend delta to include them, or maybe have some higher level edit type that includes them and deltas?
    }

    public getAttachSummary(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        const dataString = getSchemaString(this.schema);
        builder.addBlob(schemaStringKey, dataString);
        return builder.getSummaryTree();
    }

    public async summarize(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats> {
        const schemaBlobHandle = await this.schemaBlob.get();
        const builder = new SummaryTreeBuilder();
        builder.addBlob(schemaBlobKey, stringify(schemaBlobHandle));
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
        const [hasString, hasBlob] = await Promise.all(
            [services.contains(schemaStringKey), services.contains(schemaBlobKey)]);
        assert(hasString || hasBlob, 0x3d8 /* Schema is required in summary */);
        let schemaBuffer: ArrayBufferLike;
        if (hasBlob) {
            const handleBuffer = await services.readBlob(schemaBlobKey);
            const handleString = bufferToString(handleBuffer, "utf-8");
            const handle = parse(handleString) as IFluidHandle<ArrayBufferLike>;
            schemaBuffer = await handle.get();
        } else {
            schemaBuffer = await services.readBlob(schemaStringKey);
        }

        // After the awaits, validate that the schema is in a clean state.
        // This detects any schema that could have been accidentally added through
        // invalid means and are about to be overwritten.
        assert(schemaDataIsEmpty(this.schema), 0x3da /* there should not already be stored schema when loading stored schema */);

        const schemaString = bufferToString(schemaBuffer, "utf-8");
        const decoded = parseSchemaString(schemaString);
        this.schema.update(decoded);
    }
}

interface SchemaOp {
    readonly type: "SchemaOp",
    readonly data: string,
}

/**
 * Wraps a StoredSchemaRepository, adjusting its "update" function to hook into Fluid Ops.
 *
 * TODO: this should be more integrated with both SchemaIndex and transactions.
 */
export class SchemaEditor implements StoredSchemaRepository {
    public constructor(public readonly inner: StoredSchemaRepository, private readonly submit: (op: SchemaOp) => void) {
    }

    /**
     * @returns true if this is a schema op and was handled.
     *
     * TODO: Shared tree needs a pattern for handling non-changeset operations.
     * See TODO on `SharedTree.processCore`.
     */
    tryHandleOp(message: ISequencedDocumentMessage): boolean {
        const op: JsonCompatibleReadOnly = message.contents;
        if (isJsonObject(op) && op.type === "SchemaOp") {
            const data  = parseSchemaString(op.data as string);
            // TODO: This does not correctly handle concurrency of schema edits.
            this.inner.update(data);
            return true;
        }
        return false;
    }

    update(newSchema: SchemaData): void {
        const op: SchemaOp = { type: "SchemaOp", data: getSchemaString(newSchema)}
        this.submit(op);
        this.inner.update(newSchema);
    }

    registerDependent(dependent: Dependent): boolean {
        return this.inner.registerDependent(dependent);
    }

    removeDependent(dependent: Dependent): void {
        return this.inner.removeDependent(dependent);
    }

    get computationName(): string {
        return this.inner.computationName;
    }

    get listDependees(): undefined | (() => Iterable<Dependee>) {
        return this.inner.listDependees?.bind(this.inner);
    }

    get policy(): SchemaPolicy {
        return this.inner.policy;
    }

    get globalFieldSchema(): ReadonlyMap<GlobalFieldKey, FieldSchema> {
        return this.inner.globalFieldSchema;
    }

    get treeSchema(): ReadonlyMap<TreeSchemaIdentifier, TreeSchema> {
        return this.inner.treeSchema;
    }
}
