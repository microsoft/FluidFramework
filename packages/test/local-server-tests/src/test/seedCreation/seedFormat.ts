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

/**
 * The initial application root; ordinary native summaries do not preserve this input.
 */
export const seedRoot = "applicationProjection";
/**
 * Application code selected by the reference host, not a general-purpose seed codec.
 */
export const codeDetails = { package: "seed-creation-reference/1" };

/** Bounded ASCII names; comparing the full match also rejects a trailing line terminator. */
const partNamePattern = /^[a-z][\da-z-]{0,31}$/u;

/**
 * One independently editable text part. No markup, assets, or references are supported.
 */
export interface TextPart {
	/** Stable application name, not a Fluid node identifier. */
	readonly name: string;
	/** Complete initial text value. */
	readonly text: string;
}

/**
 * Bounded external JSON format used only for initial creation.
 */
export interface TextSeed {
	/** Reject incompatible input before constructing any DDS state. */
	readonly format: "seed-creation/1";
	/** Exactly two differently named parts, sorted by name during parsing. */
	readonly parts: readonly [TextPart, TextPart];
}

/**
 * Validate all supported input fields and return a canonical, sorted copy.
 * Despite the name, this also normalizes the input (sorting parts by name); it is not a pure
 * validity check.
 */
export function parseSeed(input: unknown): TextSeed {
	if (
		typeof input !== "object" ||
		input === null ||
		!("format" in input) ||
		input.format !== "seed-creation/1" ||
		!("parts" in input) ||
		!Array.isArray(input.parts) ||
		input.parts.length !== 2 ||
		Object.keys(input).length !== 2
	) {
		throw new Error("Expected seed-creation/1 with exactly two text parts");
	}
	const parts = input.parts.map((part: unknown): TextPart => {
		if (
			typeof part !== "object" ||
			part === null ||
			!("name" in part) ||
			typeof part.name !== "string" ||
			partNamePattern.exec(part.name)?.[0] !== part.name ||
			!("text" in part) ||
			typeof part.text !== "string" ||
			part.text.length > 100_000 ||
			Object.keys(part).length !== 2
		) {
			throw new Error("Unsupported text part; expected a bounded name and text only");
		}
		return { name: part.name, text: part.text };
	});
	parts.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
	const [first, second] = parts;
	if (first.name === second.name) {
		throw new Error("Seed part names must be distinct");
	}
	return { format: "seed-creation/1", parts: [first, second] };
}

/**
 * Produce protocol metadata and application bytes without constructing a Container or DDS.
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
