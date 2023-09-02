/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
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
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { ICodecOptions, IJsonCodec } from "../codec";
import {
	cachedValue,
	Dependee,
	Dependent,
	ICachedValue,
	recordDependency,
	FieldStoredSchema,
	SchemaData,
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
		const dataString = this.codec.encode(this.schema);
		return createSingleBlobSummary(schemaStringKey, dataString);
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		const schemaBlobHandle = await this.schemaBlob.get();
		return createSingleBlobSummary(schemaBlobKey, stringify(schemaBlobHandle));
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
	public tryHandleOp(encodedOp: JsonCompatibleReadOnly): boolean {
		const op = this.tryDecodeOp(encodedOp);
		if (op !== undefined) {
			// TODO: This does not correctly handle concurrency of schema edits.
			this.inner.update(op);
			return true;
		}
		return false;
	}

	public tryApplyStashedOp(encodedOp: JsonCompatibleReadOnly): boolean {
		return this.tryHandleOp(encodedOp);
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

	public get rootFieldSchema(): FieldStoredSchema {
		return this.inner.rootFieldSchema;
	}

	public get treeSchema(): ReadonlyMap<TreeSchemaIdentifier, TreeStoredSchema> {
		return this.inner.treeSchema;
	}

	private tryDecodeOp(encodedOp: JsonCompatibleReadOnly): SchemaData | undefined {
		if (isJsonObject(encodedOp) && encodedOp.type === "SchemaOp") {
			assert(
				typeof encodedOp.data === "string",
				0x6ca /* SchemaOps should have string data */,
			);
			return this.codec.decode(encodedOp.data);
		}

		return undefined;
	}
}
