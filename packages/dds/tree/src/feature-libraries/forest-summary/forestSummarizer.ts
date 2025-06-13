/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import {
	SummaryTreeBuilder,
	type ReadAndParseBlob,
} from "@fluidframework/runtime-utils/internal";

import type { CodecWriteOptions } from "../../codec/index.js";
import {
	type DeltaDetachedNodeBuild,
	type DeltaFieldChanges,
	type FieldKey,
	type IEditableForest,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	type RevisionTagCodec,
	TreeNavigationResult,
	applyDelta,
	forEachField,
	makeDetachedFieldIndex,
} from "../../core/index.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import { idAllocatorFromMaxId } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { chunkFieldSingle, defaultChunkPolicy } from "../chunked-forest/chunkTree.js";
import {
	type FieldBatchCodec,
	type FieldBatchEncodingContext,
	type EncodedFieldBatchFormat,
	FieldUnchanged,
	type EncodedFieldBatch,
} from "../chunked-forest/index.js";

import { type ForestCodec, makeForestSummarizerCodec } from "./codec.js";
import type { Format } from "./format.js";
import { incrementalFieldsTreeKey, IncrementalSummaryTracker } from "./summaryTrackers.js";
import { SummaryType } from "@fluidframework/driver-definitions";

export const forestSummaryTreeKey = "Forest";
export const forestSummaryContentKey = "ForestTree";
export const fieldContentsKey = "fieldContents";
export const incrementalFieldPathsKey = "IncrementalFieldPaths";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer implements Summarizable {
	public readonly key = "Forest";

	private readonly codec: ForestCodec;

	private readonly incrementalSummaryTracker = new IncrementalSummaryTracker();

	/**
	 * @param encoderContext - The schema if provided here must be mutated by the caller to keep it up to date.
	 */
	public constructor(
		private readonly forest: IEditableForest,
		private readonly revisionTagCodec: RevisionTagCodec,
		fieldBatchCodec: FieldBatchCodec,
		private readonly encoderContext: FieldBatchEncodingContext,
		options: CodecWriteOptions,
		private readonly idCompressor: IIdCompressor,
	) {
		// TODO: this should take in CodecWriteOptions, and use it to pick the write version.
		this.codec = makeForestSummarizerCodec(options, fieldBatchCodec);
	}

	/* eslint-disable jsdoc/check-indentation */
	/**
	 * The summary tree structure with incremental summary looks like this:
	 *     Forest (added outside this function)
	 *     ├── ForestTree
	 *     ├── IncrementalFields
	 *         ├── fieldId1
	 *         |   ├── fieldContents
	 *         |   ├── IncrementalFields
	 *         |       ├── fieldId2
	 *         |           ├── fieldContents
	 *         |           ...
	 *         |       ├── /Forest/ForestTree/IncrementalFields/field1/IncrementalFields/fieldId3 - Summary Handle
	 *         ├── fieldId4
	 *             ├── fieldContents
	 *             ...
	 *         ├── /Forest/ForestTree/IncrementalFields/fieldId5 - Summary Handle
	 *         ...
	 */
	/* eslint-enable jsdoc/check-indentation */
	private buildIncrementalFieldsSummary(
		stringify: SummaryElementStringifier,
		parentSummaryBuilder: SummaryTreeBuilder,
		parentIncrementalFieldsBatch: Map<string, EncodedFieldBatchFormat>,
		parentBlobId: string,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): void {
		// this.incrementalSummaryTracker.trackNewSummary(incrementalSummaryContext);
		assert(
			incrementalSummaryContext !== undefined,
			"incrementalSummaryContext must be defined if there are incremental fields",
		);
		// Summary builder for the incremental field tree under the key "IncrementalFields"
		const childrenSummaryBuilder = new SummaryTreeBuilder();
		for (const [fieldKey, fieldIncrementalFieldsBatch] of parentIncrementalFieldsBatch) {
			if (fieldIncrementalFieldsBatch === FieldUnchanged) {
				const childSummaryHandlePath = this.incrementalSummaryTracker.getSummaryHandlePath(
					fieldKey,
					incrementalSummaryContext,
				);
				assert(childSummaryHandlePath !== undefined, "childSummaryHandlePath must be defined");
				childrenSummaryBuilder.addHandle(fieldKey, SummaryType.Tree, childSummaryHandlePath);
			} else {
				// Summary builder for the field contents tree under the field's unique id "fieldKey".
				const fieldSummaryBuilder = new SummaryTreeBuilder();
				fieldSummaryBuilder.addBlob(
					fieldContentsKey,
					stringify(fieldIncrementalFieldsBatch.fieldBatch),
				);
				if (fieldIncrementalFieldsBatch.incrementalFieldsBatch.size > 0) {
					this.buildIncrementalFieldsSummary(
						stringify,
						fieldSummaryBuilder,
						fieldIncrementalFieldsBatch.incrementalFieldsBatch,
						fieldKey,
						incrementalSummaryContext,
					);
				}
				childrenSummaryBuilder.addWithStats(fieldKey, fieldSummaryBuilder.getSummaryTree());
			}
			this.incrementalSummaryTracker.trackBlob(
				fieldKey,
				parentBlobId,
				incrementalSummaryContext,
			);
		}
		parentSummaryBuilder.addWithStats(
			incrementalFieldsTreeKey,
			childrenSummaryBuilder.getSummaryTree(),
		);
	}

	/**
	 * Synchronous monolithic summarization of tree content.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 *
	 * @returns a snapshot of the forest's tree as a string.
	 */
	private getSummaryTree(
		stringify: SummaryElementStringifier,
		fullTree: boolean,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats {
		const rootCursor = this.forest.getCursorAboveDetachedFields();
		const fieldMap: Map<FieldKey, ITreeCursorSynchronous & ITreeSubscriptionCursor> =
			new Map();
		// TODO: Encode all detached fields in one operation for better performance and compression
		forEachField(rootCursor, (cursor) => {
			const key = cursor.getFieldKey();
			const innerCursor = this.forest.allocateCursor("getTreeString");
			assert(
				this.forest.tryMoveCursorToField({ fieldKey: key, parent: undefined }, innerCursor) ===
					TreeNavigationResult.Ok,
				0x892 /* failed to navigate to field */,
			);
			fieldMap.set(key, innerCursor as ITreeCursorSynchronous & ITreeSubscriptionCursor);
		});

		const outputIncrementalFieldsBatch: Map<string, EncodedFieldBatchFormat> = new Map();
		const encoderContext: FieldBatchEncodingContext = {
			...this.encoderContext,
			outputIncrementalFieldsBatch:
				fullTree === false && incrementalSummaryContext !== undefined
					? outputIncrementalFieldsBatch
					: undefined,
		};
		const encoded = this.codec.encode(fieldMap, encoderContext);
		fieldMap.forEach((value) => value.free());

		const rootSummaryBuilder = new SummaryTreeBuilder();
		rootSummaryBuilder.addBlob(forestSummaryContentKey, stringify(encoded));

		// If there are incremental fields, build incremental fields summary.
		if (outputIncrementalFieldsBatch.size > 0) {
			this.buildIncrementalFieldsSummary(
				stringify,
				rootSummaryBuilder,
				outputIncrementalFieldsBatch,
				"",
				incrementalSummaryContext,
			);

			this.incrementalSummaryTracker.summaryComplete(incrementalSummaryContext);
			const incrementalBlobLeafPaths =
				this.incrementalSummaryTracker.getIncrementalBlobLeafPaths(incrementalSummaryContext);
			rootSummaryBuilder.addBlob(
				incrementalFieldPathsKey,
				stringify(incrementalBlobLeafPaths),
			);
			console.log("Incremental summary blobs", incrementalBlobLeafPaths);
		}

		return rootSummaryBuilder.getSummaryTree();
	}

	public summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats {
		return this.getSummaryTree(
			props.stringify,
			props.fullTree ?? false,
			props.incrementalSummaryContext,
		);
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(forestSummaryContentKey)) {
			const readAndParse: ReadAndParseBlob = async <T>(id: string): Promise<T> => {
				const blob = await services.readBlob(id);
				const decoded = bufferToString(blob, "utf8");
				return parse(decoded) as T;
			};
			const incrementalFieldsBatch: Map<string, EncodedFieldBatch> = new Map();
			if (await services.contains(incrementalFieldPathsKey)) {
				const incrementalFieldPaths = await readAndParse<string[]>(incrementalFieldPathsKey);
				for (const incrementalFieldPath of incrementalFieldPaths) {
					const pathParts = incrementalFieldPath.split("/");
					if (pathParts.length === 1) {
						continue;
					}

					const incrementalFieldPathParts = pathParts.slice(1);
					let incrementalFieldSummaryPath = "";
					for (const incrementalFieldPathPart of incrementalFieldPathParts) {
						incrementalFieldSummaryPath += `${incrementalFieldsTreeKey}/${incrementalFieldPathPart}/`;
						const fieldContents = await readAndParse<EncodedFieldBatch>(
							`${incrementalFieldSummaryPath}${fieldContentsKey}`,
						);
						incrementalFieldsBatch.set(incrementalFieldPathPart, fieldContents);
					}
				}
			}
			const getIncrementalFieldBatch = (fieldKey: string): EncodedFieldBatch => {
				assert(
					incrementalFieldsBatch.has(fieldKey),
					`incremental blob table must have blobId`,
				);
				const encodedFieldBatch = incrementalFieldsBatch.get(fieldKey);
				assert(encodedFieldBatch !== undefined, `Could not find data for ${fieldKey}`);
				return encodedFieldBatch;
			};

			const encoderContext: FieldBatchEncodingContext = {
				...this.encoderContext,
				getIncrementalFieldBatch,
			};

			// TODO: this code is parsing data without an optional validator, this should be defined in a typebox schema as part of the
			// forest summary format.
			const fields = this.codec.decode(
				await readAndParse<Format>(forestSummaryContentKey),
				encoderContext,
			);
			const allocator = idAllocatorFromMaxId();
			const fieldChanges: [FieldKey, DeltaFieldChanges][] = [];
			const build: DeltaDetachedNodeBuild[] = [];
			for (const [fieldKey, field] of fields) {
				const chunked = chunkFieldSingle(field, {
					policy: defaultChunkPolicy,
					idCompressor: this.idCompressor,
				});
				const buildId = { minor: allocator.allocate(chunked.topLevelLength) };
				build.push({
					id: buildId,
					trees: chunked,
				});
				fieldChanges.push([fieldKey, [{ count: chunked.topLevelLength, attach: buildId }]]);
			}

			assert(this.forest.isEmpty, 0x797 /* forest must be empty */);
			applyDelta(
				{ build, fields: new Map(fieldChanges) },
				undefined,
				this.forest,
				makeDetachedFieldIndex("init", this.revisionTagCodec, this.idCompressor),
			);
			return;
		}
	}

	public async loadOld(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(forestSummaryContentKey)) {
			const treeBuffer = await services.readBlob(forestSummaryContentKey);
			const treeBufferString = bufferToString(treeBuffer, "utf8");
			// TODO: this code is parsing data without an optional validator, this should be defined in a typebox schema as part of the
			// forest summary format.
			const fields = this.codec.decode(parse(treeBufferString) as Format, this.encoderContext);
			const allocator = idAllocatorFromMaxId();
			const fieldChanges: [FieldKey, DeltaFieldChanges][] = [];
			const build: DeltaDetachedNodeBuild[] = [];
			for (const [fieldKey, field] of fields) {
				const chunked = chunkFieldSingle(field, {
					policy: defaultChunkPolicy,
					idCompressor: this.idCompressor,
				});
				const buildId = { minor: allocator.allocate(chunked.topLevelLength) };
				build.push({
					id: buildId,
					trees: chunked,
				});
				fieldChanges.push([fieldKey, [{ count: chunked.topLevelLength, attach: buildId }]]);
			}

			assert(this.forest.isEmpty, 0x797 /* forest must be empty */);
			applyDelta(
				{ build, fields: new Map(fieldChanges) },
				undefined,
				this.forest,
				makeDetachedFieldIndex("init", this.revisionTagCodec, this.idCompressor),
			);
		}
	}
}
