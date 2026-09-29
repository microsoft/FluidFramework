/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISummaryTree } from "@fluidframework/driver-definitions/internal";
import { calculateStats, SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import {
	canonicalParts,
	codeDetails,
	createApplicationProjection,
	projectionLayout,
	type IHtmlPart,
} from "./appProjection.js";
import { parseHtml } from "./htmlSeedFormat.js";

/**
 * Create the external producer's loader envelope using only protocol metadata and application bytes.
 * No Loader, Container, SharedTree, compressor, or generated runtime snapshot is constructed here.
 * Storage assigns file identity; repeated creation from the same named parts is deterministic.
 */
export function createSeedSummary(
	parts: readonly IHtmlPart[],
	options: { includeManifest?: boolean; manifest?: string } = {},
): ISummaryTree {
	for (const { payload } of canonicalParts(parts)) parseHtml(payload);
	const protocol = new SummaryTreeBuilder();
	protocol.addBlob(
		"attributes",
		JSON.stringify({ sequenceNumber: 0, minimumSequenceNumber: 0 }),
	);
	protocol.addBlob("quorumMembers", "[]");
	protocol.addBlob("quorumProposals", "[]");
	protocol.addBlob(
		"quorumValues",
		JSON.stringify([
			[
				"code",
				{
					key: "code",
					value: codeDetails,
					approvalSequenceNumber: 0,
					commitSequenceNumber: 0,
					sequenceNumber: 0,
				},
			],
		]),
	);
	const projection = createApplicationProjection(parts, options);
	const app = new SummaryTreeBuilder();
	app.addWithStats(projectionLayout.key, {
		summary: projection,
		stats: calculateStats(projection),
	});
	const seed = new SummaryTreeBuilder();
	seed.addWithStats(".protocol", protocol);
	seed.addWithStats(".app", app);
	return seed.summary;
}
