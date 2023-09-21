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
import {
	IEditableForest,
	initializeForest,
	ITreeSubscriptionCursor,
	JsonableTree,
	mapCursorField,
	moveToDetachedField,
} from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
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

	public constructor(private readonly forest: IEditableForest) {
		this.cursor = this.forest.allocateCursor();
	}

	/**
	 * Synchronous monolithic summarization of tree content.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 *
	 * @returns a snapshot of the forest's tree as a string.
	 */
	private getTreeString(stringify: SummaryElementStringifier): string {
		// TODO: maybe assert there are no other roots
		// (since we don't save them, and they should not exist outside transactions).
		moveToDetachedField(this.forest, this.cursor);
		const roots = mapCursorField(this.cursor, jsonableTreeFromCursor);
		this.cursor.clear();
		return stringify(roots);
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
			const jsonableTree = parse(treeBufferString) as JsonableTree[];
			initializeForest(this.forest, jsonableTree.map(singleTextCursor));
		}
	}
}
