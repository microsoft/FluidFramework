/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { bufferToString } from "@fluid-internal/client-utils";
import { TreeIndex } from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";

/**
 * The storage key for the blob in the summary containing schema data
 */
const treeIndexBlobKey = "TreeIndexBlob";

/**
 * Provides methods for summarizing and loading a tree index.
 */
export class TreeIndexSummarizer implements Summarizable {
	public readonly key = "TreeIndex";

	public constructor(private readonly treeIndex: TreeIndex) {}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return createSingleBlobSummary(treeIndexBlobKey, this.treeIndex.encode());
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return createSingleBlobSummary(treeIndexBlobKey, this.treeIndex.encode());
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
		if (await services.contains(treeIndexBlobKey)) {
			const treeIndexBuffer = await services.readBlob(treeIndexBlobKey);
			const treeBufferString = bufferToString(treeIndexBuffer, "utf8");
			this.treeIndex.loadData(treeBufferString);
		}
	}
}
