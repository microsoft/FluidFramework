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
	type TreeNodeSchemaIdentifier,
	applyDelta,
	forEachField,
	makeDetachedFieldIndex,
} from "../../core/index.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import { idAllocatorFromMaxId, type JsonCompatible } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { chunkFieldSingle, defaultChunkPolicy } from "../chunked-forest/chunkTree.js";
import type { FieldBatchCodec, FieldBatchEncodingContext } from "../chunked-forest/index.js";

import { type ForestCodec, makeForestSummarizerCodec } from "./codec.js";
import {
	ForestIncrementalSummaryBehavior,
	ForestIncrementalSummaryBuilder,
	forestSummaryContentKey,
} from "./incrementalSummaryBuilder.js";
import { TreeCompressionStrategyExtended } from "../treeCompressionUtils.js";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

/**
 * The key for the tree that contains the overall forest's summary tree.
 * This tree is added by the parent of the forest summarizer.
 * See {@link ForestIncrementalSummaryBuilder} for details on the summary structure.
 */
export const forestSummaryKey = "Forest";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer implements Summarizable {
	public readonly key = forestSummaryKey;

	private readonly codec: ForestCodec;

	private readonly incrementalSummaryBuilder: ForestIncrementalSummaryBuilder;

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
		shouldEncodeFieldIncrementally?: (
			nodeIdentifier: TreeNodeSchemaIdentifier,
			fieldKey: FieldKey,
		) => boolean,
	) {
		// TODO: this should take in CodecWriteOptions, and use it to pick the write version.
		this.codec = makeForestSummarizerCodec(options, fieldBatchCodec);

		const shouldEncodeFieldIncrementallyLocal = (
			nodeIdentifier: TreeNodeSchemaIdentifier,
			fieldKey: FieldKey,
		): boolean => shouldEncodeFieldIncrementally?.(nodeIdentifier, fieldKey) ?? false;
		this.incrementalSummaryBuilder = new ForestIncrementalSummaryBuilder(
			encoderContext.encodeType ===
				TreeCompressionStrategyExtended.CompressedIncremental /* enableIncrementalSummary */,
			(cursor: ITreeCursorSynchronous) => this.forest.chunkField(cursor),
			shouldEncodeFieldIncrementallyLocal,
		);
	}

	/**
	 * Summarization of the forest's tree content.
	 * @returns a summary tree containing the forest's tree content.
	 * @remarks
	 * If incremental summary is disabled, all the content will be added to a single summary blob.
	 * If incremental summary is enabled, the summary will be a tree.
	 * See {@link ForestIncrementalSummaryBuilder} for details of what this tree looks like.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 */
	public summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats {
		const { stringify, fullTree = false, incrementalSummaryContext } = props;

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

		// Let the incremental summary builder know that we are starting a new summary.
		// It returns whether incremental encoding is enabled.
		const incrementalSummaryBehavior = this.incrementalSummaryBuilder.startSummary({
			fullTree,
			incrementalSummaryContext,
			stringify,
		});
		const encoderContext: FieldBatchEncodingContext = {
			...this.encoderContext,
			incrementalEncoderDecoder:
				incrementalSummaryBehavior === ForestIncrementalSummaryBehavior.Incremental
					? this.incrementalSummaryBuilder
					: undefined,
		};
		const encoded = this.codec.encode(fieldMap, encoderContext);
		fieldMap.forEach((value) => value.free());

		return this.incrementalSummaryBuilder.completeSummary({
			incrementalSummaryContext,
			forestSummaryContent: stringify(encoded),
		});
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		// The contents of the top-level forest must be present under a summary blob named `forestSummaryContentKey`.
		// If the summary was generated as `ForestIncrementalSummaryBehavior.SingleBlob`, this blob will contain all
		// of forest's contents.
		// If the summary was generated as `ForestIncrementalSummaryBehavior.Incremental`, this blob will contain only
		// the top-level forest node's contents.
		// The contents of the incremental chunks will be in separate tree nodes and will be read later during decoding.
		assert(
			await services.contains(forestSummaryContentKey),
			"Forest summary content missing in snapshot",
		);

		const readAndParseBlob = async <T extends JsonCompatible<IFluidHandle>>(
			id: string,
		): Promise<T> => {
			const treeBuffer = await services.readBlob(id);
			const treeBufferString = bufferToString(treeBuffer, "utf8");
			return parse(treeBufferString) as T;
		};

		// Load the incremental summary builder so that it can download any incremental chunks in the
		// snapshot.
		await this.incrementalSummaryBuilder.load(services, readAndParseBlob);

		// TODO: this code is parsing data without an optional validator, this should be defined in a typebox schema as part of the
		// forest summary format.
		const fields = this.codec.decode(await readAndParseBlob(forestSummaryContentKey), {
			...this.encoderContext,
			incrementalEncoderDecoder: this.incrementalSummaryBuilder,
		});
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
