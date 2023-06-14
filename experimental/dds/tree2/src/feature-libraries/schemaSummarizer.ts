/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ICodecOptions, IJsonCodec } from "../codec";
import {
	cachedValue,
	Dependee,
	Dependent,
	ICachedValue,
	recordDependency,
	FieldStoredSchema,
	GlobalFieldKey,
	SchemaData,
	SchemaPolicy,
	StoredSchemaRepository,
	TreeStoredSchema,
	TreeSchemaIdentifier,
	schemaDataIsEmpty,
	SchemaEvents,
} from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { isJsonObject, JsonCompatibleReadOnly } from "../util";
import { makeSchemaCodec } from "./schemaIndexFormat";

/**
 * The storage key for the blob in the summary containing schema data
 */
const schemaBlobKey = "SchemaBlob";

const schemaStringKey = "SchemaString";

/**
 * Provides methods for summarizing and loading a schema repository.
 */
export class SchemaSummarizer implements Summarizable {
	public readonly key = "Schema";

	private readonly schemaBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;
	private readonly codec: IJsonCodec<SchemaData, string>;

	public constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly schema: StoredSchemaRepository,
		options: ICodecOptions,
	) {
		this.codec = makeSchemaCodec(options);
		this.schemaBlob = cachedValue(async (observer) => {
			recordDependency(observer, this.schema);
			const schemaText = this.codec.encode(this.schema);

			// For now we are not chunking the the schema, but still put it in a reusable blob:
			return this.runtime.uploadBlob(IsoBuffer.from(schemaText));
		});
	}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		const dataString = this.codec.encode(this.schema);
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

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		const [hasString, hasBlob] = await Promise.all([
			services.contains(schemaStringKey),
			services.contains(schemaBlobKey),
		]);
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
		assert(
			schemaDataIsEmpty(this.schema),
			0x3da /* there should not already be stored schema when loading stored schema */,
		);

		const schemaString = bufferToString(schemaBuffer, "utf-8");
		const decoded = this.codec.decode(schemaString);
		this.schema.update(decoded);
	}
}

interface SchemaOp {
	readonly type: "SchemaOp";
	readonly data: string;
}

/**
 * Wraps a StoredSchemaRepository, adjusting its "update" function to hook into Fluid Ops.
 *
 * TODO: this should be more integrated with transactions.
 */
export class SchemaEditor<TRepository extends StoredSchemaRepository>
	implements StoredSchemaRepository
{
	private readonly codec: IJsonCodec<SchemaData, string>;
	public constructor(
		public readonly inner: TRepository,
		private readonly submit: (op: SchemaOp) => void,
		options: ICodecOptions,
	) {
		this.codec = makeSchemaCodec(options);
	}

	public on<K extends keyof SchemaEvents>(eventName: K, listener: SchemaEvents[K]): () => void {
		return this.inner.on(eventName, listener);
	}

	/**
	 * @returns true if this is a schema op and was handled.
	 *
	 * TODO: Shared tree needs a pattern for handling non-changeset operations.
	 * See TODO on `SharedTree.processCore`.
	 */
	public tryHandleOp(message: ISequencedDocumentMessage): boolean {
		const op: JsonCompatibleReadOnly = message.contents;
		if (isJsonObject(op) && op.type === "SchemaOp") {
			assert(typeof op.data === "string", "SchemaOps should have string data");
			const data = this.codec.decode(op.data);
			// TODO: This does not correctly handle concurrency of schema edits.
			this.inner.update(data);
			return true;
		}
		return false;
	}

	/**
	 * @returns true iff this is a schema op and was submitted.
	 *
	 * TODO: Shared tree needs a pattern for handling non-changeset operations.
	 * See TODO on `SharedTree.processCore`.
	 */
	public tryResubmitOp(content: JsonCompatibleReadOnly): boolean {
		const op: JsonCompatibleReadOnly = content;
		if (isJsonObject(op) && op.type === "SchemaOp") {
			assert(
				typeof op.data === "string",
				0x5e3 /* expected string data for resubmitted schema op */,
			);
			const schemaOp: SchemaOp = {
				type: op.type,
				data: op.data,
			};
			this.submit(schemaOp);
			return true;
		}
		return false;
	}

	public update(newSchema: SchemaData): void {
		const op: SchemaOp = { type: "SchemaOp", data: this.codec.encode(newSchema) };
		this.submit(op);
		this.inner.update(newSchema);
	}

	public registerDependent(dependent: Dependent): boolean {
		return this.inner.registerDependent(dependent);
	}

	public removeDependent(dependent: Dependent): void {
		return this.inner.removeDependent(dependent);
	}

	public get computationName(): string {
		return this.inner.computationName;
	}

	public get listDependees(): undefined | (() => Iterable<Dependee>) {
		return this.inner.listDependees?.bind(this.inner);
	}

	public get policy(): SchemaPolicy {
		return this.inner.policy;
	}

	public get globalFieldSchema(): ReadonlyMap<GlobalFieldKey, FieldStoredSchema> {
		return this.inner.globalFieldSchema;
	}

	public get treeSchema(): ReadonlyMap<TreeSchemaIdentifier, TreeStoredSchema> {
		return this.inner.treeSchema;
	}
}
