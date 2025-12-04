/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import type { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

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
import {
	VersionedSummarizer,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import { idAllocatorFromMaxId, readAndParseSnapshotBlob } from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { chunkFieldSingle, defaultChunkPolicy } from "../chunked-forest/chunkTree.js";
import {
	defaultIncrementalEncodingPolicy,
	type FieldBatchCodec,
	type FieldBatchEncodingContext,
	type IncrementalEncodingPolicy,
} from "../chunked-forest/index.js";

import { type ForestCodec, makeForestSummarizerCodec } from "./codec.js";
import {
	ForestIncrementalSummaryBehavior,
	ForestIncrementalSummaryBuilder,
} from "./incrementalSummaryBuilder.js";
import {
	forestSummaryContentKey,
	forestSummaryKey,
	minVersionToForestSummaryFormatVersion,
	supportedForestSummaryFormatVersions,
	type ForestSummaryFormatVersion,
} from "./summaryTypes.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer
	extends VersionedSummarizer<ForestSummaryFormatVersion>
	implements Summarizable
{
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
		initialSequenceNumber: number,
		shouldEncodeIncrementally: IncrementalEncodingPolicy = defaultIncrementalEncodingPolicy,
	) {
		super(
			forestSummaryKey,
			minVersionToForestSummaryFormatVersion(options.minVersionForCollab),
			supportedForestSummaryFormatVersions,
			true /* supportPreVersioningFormat */,
		);

		// TODO: this should take in CodecWriteOptions, and use it to pick the write version.
		this.codec = makeForestSummarizerCodec(options, fieldBatchCodec);
		this.incrementalSummaryBuilder = new ForestIncrementalSummaryBuilder(
			encoderContext.encodeType ===
				TreeCompressionStrategy.CompressedIncremental /* enableIncrementalSummary */,
			(cursor: ITreeCursorSynchronous) => this.forest.chunkField(cursor),
			shouldEncodeIncrementally,
			initialSequenceNumber,
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
	protected summarizeInternal(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
		builder: SummaryTreeBuilder;
	}): void {
		const { stringify, fullTree = false, incrementalSummaryContext, builder } = props;

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
			builder,
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

		this.incrementalSummaryBuilder.completeSummary({
			incrementalSummaryContext,
			forestSummaryContent: stringify(encoded),
			builder,
		});
	}

	protected async loadInternal(
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
			0xc21 /* Forest summary content missing in snapshot */,
		);

		// Load the incremental summary builder so that it can download any incremental chunks in the
		// snapshot.
		await this.incrementalSummaryBuilder.load({
			services,
			readAndParseChunk: async (chunkBlobPath: string) =>
				readAndParseSnapshotBlob(chunkBlobPath, services, parse),
		});

		// TODO: this code is parsing data without an optional validator, this should be defined in a typebox schema as part of the
		// forest summary format.
		const fields = this.codec.decode(
			await readAndParseSnapshotBlob(forestSummaryContentKey, services, parse),
			{
				...this.encoderContext,
				incrementalEncoderDecoder: this.incrementalSummaryBuilder,
			},
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
	}
}
