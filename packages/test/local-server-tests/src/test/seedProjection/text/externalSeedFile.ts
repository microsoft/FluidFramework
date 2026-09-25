/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest } from "@fluidframework/core-interfaces";
import { createSeedSummary as createDocumentSummary } from "@fluidframework/container-loader/legacy/alpha";
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
	const application = new SummaryTreeBuilder();
	application.addBlob("seed.json", JSON.stringify(seed));
	const app = new SummaryTreeBuilder();
	app.addWithStats(seedRoot, application);
	return createDocumentSummary({ codeDetails, applicationProjection: app.summary });
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
