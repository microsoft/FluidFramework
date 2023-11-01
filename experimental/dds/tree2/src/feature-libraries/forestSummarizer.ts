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
	JsonableTree,
	makeDetachedFieldIndex,
	mapCursorField,
	mapCursorFields,
} from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { idAllocatorFromMaxId } from "../util";
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
	public constructor(private readonly forest: IEditableForest) {}

	/**
	 * Synchronous monolithic summarization of tree content.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 *
	 * @returns a snapshot of the forest's tree as a string.
	 */
	private getTreeString(stringify: SummaryElementStringifier): string {
		const rootCursor = this.forest.getCursorAboveDetachedFields();
		const fields = mapCursorFields(rootCursor, (cursor) => [
			rootCursor.getFieldKey(),
			mapCursorField(cursor, jsonableTreeFromCursor),
		]);
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
			const fields = parse(treeBufferString) as [FieldKey, JsonableTree[]][];

			const allocator = idAllocatorFromMaxId();
			const delta: [FieldKey, Delta.FieldChanges][] = fields.map(([fieldKey, content]) => {
				const buildId = { minor: allocator.allocate(content.length) };
				return [
					fieldKey,
					{
						build: [{ id: buildId, trees: content.map(singleTextCursor) }],
						local: [{ count: content.length, attach: buildId }],
					},
				];
			});

			assert(this.forest.isEmpty, 0x797 /* forest must be empty */);
			applyDelta(new Map(delta), this.forest, makeDetachedFieldIndex("init"));
		}
	}
}
