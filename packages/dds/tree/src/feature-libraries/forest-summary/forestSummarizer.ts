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
	IIdCompressor,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { assert } from "@fluidframework/core-utils";
import {
	applyDelta,
	DeltaFieldChanges,
	FieldKey,
	forEachField,
	IEditableForest,
	ITreeCursorSynchronous,
	ITreeSubscriptionCursor,
	makeDetachedFieldIndex,
	mapCursorField,
	TreeNavigationResult,
} from "../../core/index.js";
import {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import { idAllocatorFromMaxId } from "../../util/index.js";
import { ICodecOptions, noopValidator } from "../../codec/index.js";
import { FieldBatchCodec } from "../chunked-forest/index.js";
// eslint-disable-next-line import/no-internal-modules
import { chunkField, defaultChunkPolicy } from "../chunked-forest/chunkTree.js";
import { Format } from "./format.js";
import { ForestCodec, makeForestSummarizerCodec } from "./codec.js";
/**
 * The storage key for the blob in the summary containing tree data
 */
const treeBlobKey = "ForestTree";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer implements Summarizable {
	public readonly key = "Forest";

	private readonly codec: ForestCodec;

	public constructor(
		private readonly forest: IEditableForest,
		private readonly idCompressor: IIdCompressor,
		fieldBatchCodec: FieldBatchCodec,
		options: ICodecOptions = { jsonValidator: noopValidator },
	) {
		this.codec = makeForestSummarizerCodec(options, fieldBatchCodec);
	}

	/**
	 * Synchronous monolithic summarization of tree content.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 *
	 * @returns a snapshot of the forest's tree as a string.
	 */
	private getTreeString(stringify: SummaryElementStringifier): string {
		const rootCursor = this.forest.getCursorAboveDetachedFields();
		const fieldMap: Map<FieldKey, ITreeCursorSynchronous & ITreeSubscriptionCursor> = new Map();
		// TODO: Encode all detached fields in one operation for better performance and compression
		forEachField(rootCursor, (cursor) => {
			const key = cursor.getFieldKey();
			const innerCursor = this.forest.allocateCursor();
			assert(
				this.forest.tryMoveCursorToField(
					{ fieldKey: key, parent: undefined },
					innerCursor,
				) === TreeNavigationResult.Ok,
				"failed to navigate to field",
			);
			fieldMap.set(key, innerCursor as ITreeCursorSynchronous & ITreeSubscriptionCursor);
		});
		const encoded = this.codec.encode(fieldMap);

		fieldMap.forEach((value) => value.free());
		return stringify(encoded);
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
			const fields = this.codec.decode(parse(treeBufferString) as Format);
			const allocator = idAllocatorFromMaxId();
			const fieldChanges: [FieldKey, DeltaFieldChanges][] = [];
			for (const [fieldKey, field] of fields) {
				const chunked = chunkField(field, defaultChunkPolicy);
				const nodeCursors = chunked.flatMap((chunk) =>
					mapCursorField(chunk.cursor(), (cursor) => cursor.fork()),
				);
				const buildId = { minor: allocator.allocate(nodeCursors.length) };

				fieldChanges.push([
					fieldKey,
					{
						build: [
							{
								id: buildId,
								trees: nodeCursors,
							},
						],
						local: [{ count: nodeCursors.length, attach: buildId }],
					},
				]);
			}

			assert(this.forest.isEmpty, 0x797 /* forest must be empty */);
			applyDelta(
				{ fields: new Map(fieldChanges) },
				this.forest,
				makeDetachedFieldIndex("init", this.idCompressor),
			);
		}
	}
}
