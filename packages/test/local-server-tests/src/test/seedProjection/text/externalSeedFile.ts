/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest } from "@fluidframework/core-interfaces";
import type {
	IDocumentServiceFactory,
	ISummaryTree,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import { codeDetails, parseSeed, seedRoot } from "./textSeedFormat.js";

/**
 * Produce protocol metadata and application bytes without constructing a container or DDS.
 */
export function createSeedSummary(input: unknown): ISummaryTree {
	const seed = parseSeed(input);
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
	const application = new SummaryTreeBuilder();
	application.addBlob("seed.json", JSON.stringify(seed));
	const app = new SummaryTreeBuilder();
	app.addWithStats(seedRoot, application);
	const result = new SummaryTreeBuilder();
	result.addWithStats(".protocol", protocol);
	result.addWithStats(".app", app);
	return result.summary;
}

/**
 * Create a file through an already configured driver. The caller owns authentication and requests.
 */
export async function createSeedDocument(
	input: unknown,
	factory: IDocumentServiceFactory,
	resolver: IUrlResolver,
	request: IRequest,
): Promise<string> {
	const summary = createSeedSummary(input);
	const resolved = await resolver.resolve(request);
	if (resolved === undefined) throw new Error("Cannot resolve the seed creation request");
	const service = await factory.createContainer(summary, resolved);
	try {
		return await resolver.getAbsoluteUrl(service.resolvedUrl, "");
	} finally {
		service.dispose();
	}
}
