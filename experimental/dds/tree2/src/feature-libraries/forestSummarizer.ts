/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { assert } from "@fluidframework/core-utils";
import {
	applyDelta,
	Delta,
	FieldKey,
	IEditableForest,
	ITreeCursorSynchronous,
	ITreeSubscriptionCursor,
	JsonableTree,
	makeDetachedFieldIndex,
	mapCursorField,
	mapCursorFields,
	SchemaData,
} from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { SummaryEncodeType } from "../shared-tree";
import { FullSchemaPolicy } from "./modular-schema";
import { decode, schemaCompressedEncode, uncompressedEncode, EncodedChunk } from "./chunked-forest";
import { jsonableTreeFromCursor, singleTextCursor } from "./treeTextCursor";

/**
 * The storage key for the blob in the summary containing tree data
 */
const treeBlobKey = "ForestTree";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer implements Summarizable {
	public readonly key = "Forest";

	private readonly cursor: ITreeSubscriptionCursor;

	private readonly schema: SchemaData;
	private readonly policy: FullSchemaPolicy;
	private readonly encodeType: SummaryEncodeType;

	public constructor(
		private readonly forest: IEditableForest,
		schema: SchemaData,
		policy: FullSchemaPolicy,
		encodeType: SummaryEncodeType = SummaryEncodeType.Compressed,
	) {
		this.cursor = this.forest.allocateCursor();
		this.schema = schema;
		this.policy = policy;
		this.encodeType = encodeType;
	}

	/**
	 * Synchronous monolithic summarization of tree content.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 *
	 * @returns a snapshot of the forest's tree as a string.
	 */
	private getTreeString(stringify: SummaryElementStringifier): string {
		this.forest.moveCursorToPath(undefined, this.cursor);
		// TODO: Encode all detached fields in one operation for better performance and compression
		const fields = mapCursorFields(this.cursor, (cursor) => [
			this.cursor.getFieldKey(),
			encodeSummary(
				cursor as ITreeCursorSynchronous,
				this.schema,
				this.policy,
				this.encodeType,
			),
		]);
		this.cursor.clear();
		return stringify(fields);
	}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return createSingleBlobSummary(treeBlobKey, this.getTreeString(stringify));
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return createSingleBlobSummary(treeBlobKey, this.getTreeString(stringify));
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
		if (await services.contains(treeBlobKey)) {
			const treeBuffer = await services.readBlob(treeBlobKey);
			const treeBufferString = bufferToString(treeBuffer, "utf8");
			// TODO: this code is parsing data without an optional validator, this should be defined in a typebox schema as part of the
			// forest summary format.
			const fields = parse(treeBufferString) as [FieldKey, EncodedChunk][];
			const delta: [FieldKey, Delta.Insert[]][] = fields.map(([fieldKey, content]) => {
				const cursors = mapCursorField(
					decode(content).cursor(),
					jsonableTreeFromCursor,
				).map(singleTextCursor);
				const insert: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: cursors,
				};
				return [fieldKey, [insert]];
			});

			assert(this.forest.isEmpty, "forest must be empty");
			applyDelta(new Map(delta), this.forest, makeDetachedFieldIndex("init"));
		}
	}
}

function encodeSummary(
	cursor: ITreeCursorSynchronous,
	schema: SchemaData,
	policy: FullSchemaPolicy,
	encodeType: SummaryEncodeType,
): EncodedChunk {
	switch (encodeType) {
		case SummaryEncodeType.Compressed:
			return schemaCompressedEncode(schema, policy, cursor);
		case SummaryEncodeType.Uncompressed:
			return uncompressedEncode(cursor);
		default:
			return schemaCompressedEncode(schema, policy, cursor);
	}
}
