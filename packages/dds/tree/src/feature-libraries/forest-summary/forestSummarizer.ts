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
import { incrementalFieldsTreeKey, TreeIncrementalSummaryTracker } from "./summaryTrackers.js";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

/**
 * The key for the summary tree that contains the overall forest's content.
 */
export const forestSummaryTreeKey = "Forest";
/**
 * The key for the summary tree that contains the forest's tree contents.
 */
export const forestSummaryContentKey = "ForestTree";
/**
 * The key for the summary blob that contains the contents of an incremental field.
 */
export const fieldContentsKey = "FieldContents";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer implements Summarizable {
	public readonly key = "Forest";

	private readonly codec: ForestCodec;

	private readonly incrementalSummaryTracker = new TreeIncrementalSummaryTracker();

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
	 *         |   ├── FieldContents
	 *         |   ├── IncrementalFields
	 *         |       ├── fieldId2
	 *         |           ├── FieldContents
	 *         |           ...
	 *         |       ├── /Forest/ForestTree/IncrementalFields/field1/IncrementalFields/fieldId3 - Summary Handle
	 *         ├── fieldId4
	 *             ├── FieldContents
	 *             ...
	 *         ├── /Forest/ForestTree/IncrementalFields/fieldId5 - Summary Handle
	 *         ...
	 */
	/* eslint-enable jsdoc/check-indentation */
	private buildIncrementalFieldsSummary(
		stringify: SummaryElementStringifier,
		parentSummaryBuilder: SummaryTreeBuilder,
		parentIncrementalFieldsBatch: Map<string, EncodedFieldBatchFormat>,
		parentRefId: string,
		encodeIncrementally: boolean,
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext,
	): void {
		// Summary builder for the incremental field tree under the key "IncrementalFields"
		const childrenSummaryBuilder = new SummaryTreeBuilder();
		for (const [fieldKey, fieldIncrementalFieldsBatch] of parentIncrementalFieldsBatch) {
			if (fieldIncrementalFieldsBatch === FieldUnchanged) {
				assert(
					encodeIncrementally,
					"There shouldn't be incremental fields if encodeIncrementally is false",
				);
				const childLastSummaryPath = this.incrementalSummaryTracker.getLastSummaryPath(
					fieldKey,
					incrementalSummaryContext.summaryPath,
				);
				assert(childLastSummaryPath !== undefined, "childLastSummaryPath must be defined");
				childrenSummaryBuilder.addHandle(fieldKey, SummaryType.Tree, childLastSummaryPath);
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
						encodeIncrementally,
						incrementalSummaryContext,
					);
				}
				childrenSummaryBuilder.addWithStats(fieldKey, fieldSummaryBuilder.getSummaryTree());
			}
			this.incrementalSummaryTracker.trackReferenceId(fieldKey, parentRefId);
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

		const encodeIncrementally = incrementalSummaryContext !== undefined && !fullTree;
		const outputIncrementalFieldsBatch: Map<string, EncodedFieldBatchFormat> = new Map();
		const encoderContext: FieldBatchEncodingContext = {
			...this.encoderContext,
			outputIncrementalFieldsBatch: encodeIncrementally
				? outputIncrementalFieldsBatch
				: undefined,
		};
		const encoded = this.codec.encode(fieldMap, encoderContext);
		fieldMap.forEach((value) => value.free());

		const rootSummaryBuilder = new SummaryTreeBuilder();
		rootSummaryBuilder.addBlob(forestSummaryContentKey, stringify(encoded));

		// Incremental summary context is not available when summarizing a detached container, i.e., the first ever
		// summary. In this case, use a default one to not having to check for undefined in every place.
		// Ideally shared object or upper layers do this. But for now, we do it here.
		const incrementalSummaryContextInternal: IExperimentalIncrementalSummaryContext =
			incrementalSummaryContext ?? {
				summaryPath: "",
				summarySequenceNumber: 0,
				latestSummarySequenceNumber: -1,
			};

		// If there are incremental fields, build incremental fields summary.
		if (outputIncrementalFieldsBatch.size > 0) {
			this.incrementalSummaryTracker.startTracking(incrementalSummaryContextInternal);
			this.buildIncrementalFieldsSummary(
				stringify,
				rootSummaryBuilder,
				outputIncrementalFieldsBatch,
				"/",
				encodeIncrementally,
				incrementalSummaryContextInternal,
			);
			this.incrementalSummaryTracker.completeTracking();
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

	private async getIncrementalFieldBatch(
		services: IChannelStorageService,
		readAndParse: ReadAndParseBlob,
	): Promise<Map<string, EncodedFieldBatch>> {
		const snapshotTree = services.getSnapshotTree?.();
		assert(snapshotTree !== undefined, "Snapshot tree must be available during tree load");
		const incrementalFieldsBatch: Map<string, EncodedFieldBatch> = new Map();
		const rootIncrementalFieldsTree = snapshotTree.trees[incrementalFieldsTreeKey];
		if (rootIncrementalFieldsTree === undefined) {
			return incrementalFieldsBatch;
		}

		const processIncrementalFieldsTree = async (
			incrementalFieldsTree: ISnapshotTree,
			parentTreeKey: string,
		): Promise<void> => {
			for (const [fieldKey, fieldTree] of Object.entries(incrementalFieldsTree.trees)) {
				const childTreeId = `${parentTreeKey}${incrementalFieldsTreeKey}/${fieldKey}`;
				const childFieldContentsId = `${childTreeId}/${fieldContentsKey}`;
				assert(
					await services.contains(childFieldContentsId),
					`Cannot find contents for field: ${childFieldContentsId}`,
				);
				const fieldContents = await readAndParse<EncodedFieldBatch>(childFieldContentsId);
				incrementalFieldsBatch.set(fieldKey, fieldContents);

				if (fieldTree.trees[incrementalFieldsTreeKey] !== undefined) {
					await processIncrementalFieldsTree(
						fieldTree.trees[incrementalFieldsTreeKey],
						`${childTreeId}/`,
					);
				}
			}
		};

		await processIncrementalFieldsTree(rootIncrementalFieldsTree, "");
		return incrementalFieldsBatch;
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
			const incrementalFieldsBatch: Map<string, EncodedFieldBatch> =
				await this.getIncrementalFieldBatch(services, readAndParse);
			const getIncrementalFieldBatch = (fieldKey: string): EncodedFieldBatch => {
				const encodedFieldBatch = incrementalFieldsBatch.get(fieldKey);
				assert(
					encodedFieldBatch !== undefined,
					`Could not find batch for incremental field ${fieldKey}`,
				);
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
