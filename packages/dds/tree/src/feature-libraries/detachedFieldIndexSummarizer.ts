/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base/internal";

import type { DetachedFieldIndex } from "../core/index.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../shared-tree-core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

/**
 * The storage key for the blob in the summary containing schema data
 */
const detachedFieldIndexBlobKey = "DetachedFieldIndexBlob";

/**
 * Provides methods for summarizing and loading a tree index.
 */
export class DetachedFieldIndexSummarizer implements Summarizable {
	public readonly key = "DetachedFieldIndex";

	public constructor(private readonly detachedFieldIndex: DetachedFieldIndex) {}

	public summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats {
		const data = this.detachedFieldIndex.encode();
		return createSingleBlobSummary(detachedFieldIndexBlobKey, props.stringify(data));
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(detachedFieldIndexBlobKey)) {
			const detachedFieldIndexBuffer = await services.readBlob(detachedFieldIndexBlobKey);
			const treeBufferString = bufferToString(detachedFieldIndexBuffer, "utf8");
			const parsed = parse(treeBufferString) as JsonCompatibleReadOnly;
			this.detachedFieldIndex.loadData(parsed);
		}
	}
}
