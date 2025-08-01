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
import type { FieldBatchCodec, FieldBatchEncodingContext } from "../chunked-forest/index.js";

import { type ForestCodec, makeForestSummarizerCodec } from "./codec.js";
import type { Format } from "./format.js";
import { ForestIncrementalSummaryBuilder } from "./incrementalSummaryBuilder.js";

/**
 * The key for the blob in the summary containing the forest's contents.
 */
export const forestSummaryContentKey = "ForestTree";

export const forestSummaryKey = "Forest";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer implements Summarizable {
	/**
	 * The key for the tree that contains the overall forest's summary tree. This tree is added by the parent
	 * of the forest summarizer.
	 */
	public readonly key = forestSummaryKey;

	private readonly codec: ForestCodec;

	private readonly incrementalSummaryBuilder = new ForestIncrementalSummaryBuilder({
		getChunkAtCursor: (cursor: ITreeCursorSynchronous) => this.forest.chunkField(cursor),
	});

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

	/**
	 * Summarization of the forest's tree content.
	 * If incremental summary is disabled, all the content will be added to a single summary blob.
	 * If incremental summary is enabled, the summary will be a tree. See {@link ForestIncrementalSummaryBuilder}
	 * for details of what this tree looks like.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 *
	 * @returns a summary tree containing the forest's tree content.
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

		const forestSummaryBuilder = new SummaryTreeBuilder();
		// Let the incremental summary builder know that we are starting a new summary.
		// It returns whether incremental encoding is enabled.
		const shouldEncodeIncrementally = this.incrementalSummaryBuilder.startingSummary(
			forestSummaryBuilder,
			fullTree,
			incrementalSummaryContext,
		);
		const encoderContext: FieldBatchEncodingContext = {
			...this.encoderContext,
			incrementalEncoderDecoder: shouldEncodeIncrementally
				? this.incrementalSummaryBuilder
				: undefined,
		};
		const encoded = this.codec.encode(fieldMap, encoderContext);
		fieldMap.forEach((value) => value.free());

		forestSummaryBuilder.addBlob(forestSummaryContentKey, stringify(encoded));
		// Let the incremental summary builder know that we are done with this summary.
		this.incrementalSummaryBuilder.completedSummary(incrementalSummaryContext);
		return forestSummaryBuilder.getSummaryTree();
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

			// Load the incremental summary builder so that it can download any incremental chunks in the
			// snapshot.
			await this.incrementalSummaryBuilder.load(services, readAndParse);

			// TODO: this code is parsing data without an optional validator, this should be defined in a typebox schema as part of the
			// forest summary format.
			const fields = this.codec.decode(await readAndParse<Format>(forestSummaryContentKey), {
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
}
