/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentStorageService,
	ISnapshotTree,
	ISummaryTree,
} from "@fluidframework/driver-definitions/internal";
import { calculateStats, SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import { format, parseHtml } from "./htmlSeedFormat.js";

export const projectionKey = "applicationProjection";
export const projectionGroup = "application-projection";
export const codeDetails = { package: "seed-projection-reference/2" };

/** Stable application part names; each owns one subtree in storage and one subtree in SharedTree. */
export type HtmlPartId = "first" | "second";
export const htmlPartIds: readonly HtmlPartId[] = ["first", "second"];

/** The reference document's two independently editable and independently reusable HTML parts. */
export interface HtmlParts {
	/** HTML mapped to the first SharedTree subtree and first/document.html. */
	first: string;
	/** HTML mapped to the second SharedTree subtree and second/document.html. */
	second: string;
}

/** Serialize the fixed versioned manifest without inspecting or rendering either HTML part. */
export function createProjectionManifest(): string {
	return JSON.stringify({
		format,
		parts: { first: "first/document.html", second: "second/document.html" },
	});
}

/**
 * Application-readable payload extracted from either a seed or a graduated native snapshot.
 * Storage IDs bind retained bytes to a specific snapshot; they are not native DDS identities.
 */
export interface ApplicationProjection {
	/** Storage blob ID of manifest.work in the inspected snapshot. */
	manifestId: string;
	/** Storage blob IDs for each part's document.html in the inspected snapshot. */
	partBlobIds: Record<HtmlPartId, string>;
	/** Original UTF-8 manifest JSON, including the versioned format and two part paths. */
	manifest: string;
	/** Original UTF-8 HTML payloads; reading does not canonicalize or materialize either part. */
	parts: HtmlParts;
}

/**
 * Create the application-owned subtree shared by seed creation and later native summaries.
 * Equal parts produce byte-identical output; this does not allocate IDs or inspect a live runtime.
 * The caller supplies supported HTML (validated during creation or canonicalized by the live model).
 */
export function createApplicationProjection(parts: HtmlParts): ISummaryTree {
	const projection = new SummaryTreeBuilder({ groupId: projectionGroup });
	projection.addBlob("manifest.work", createProjectionManifest());
	for (const partId of htmlPartIds) {
		const part = new SummaryTreeBuilder();
		part.addBlob("document.html", parts[partId]);
		projection.addWithStats(partId, part);
	}
	return projection.summary;
}

/**
 * Create a loader-valid seed summary containing only protocol metadata and application bytes.
 * This is external-producer sample code: pass the result to SeedWorkflowBackend.create(), or encode
 * the same envelope for a storage creation API. No Loader, Container, DDS, or native model is created.
 * The envelope and fixed code package are a reference protocol, not a stable public file format.
 * For identical HTML the result is identical; file identity is allocated by storage, not here.
 */
export function createSeedSummary(parts: HtmlParts): ISummaryTree {
	for (const partId of htmlPartIds) parseHtml(parts[partId]);
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
	const projection = createApplicationProjection(parts);
	const app = new SummaryTreeBuilder();
	app.addWithStats(projectionKey, { summary: projection, stats: calculateStats(projection) });
	const seed = new SummaryTreeBuilder();
	seed.addWithStats(".protocol", protocol);
	seed.addWithStats(".app", app);
	return seed.summary;
}

/**
 * Read application content directly from a stored snapshot, without loading a Fluid runtime.
 * Accept the app-root snapshot returned by SeedWorkflowBackend.inspect() (the driver has unwrapped
 * `.app`), and its readBlob callback. The same operation reads the initial seed and later native
 * summaries, even if loading groups omitted the payload bytes from the downloaded snapshot.
 * A retained payload may avoid reads during pending-state restoration, but its IDs must match.
 * Invalid or unsupported manifests fail explicitly rather than being interpreted as another format.
 */
export async function readApplicationProjection(
	snapshot: ISnapshotTree,
	readBlob: IDocumentStorageService["readBlob"],
	options: {
		/** Previously retained source bytes, usable only when all manifest and part blob IDs match. */
		retained?: ApplicationProjection;
	} = {},
): Promise<ApplicationProjection> {
	const projectionTree: ISnapshotTree | undefined = snapshot.trees[projectionKey];
	const manifestId: string | undefined = projectionTree?.blobs["manifest.work"];
	const firstId: string | undefined = projectionTree?.trees.first?.blobs["document.html"];
	const secondId: string | undefined = projectionTree?.trees.second?.blobs["document.html"];
	if (manifestId === undefined || firstId === undefined || secondId === undefined) {
		throw new Error("Not a supported seed envelope");
	}
	const { retained } = options;
	if (
		retained !== undefined &&
		(retained.manifestId !== manifestId ||
			retained.partBlobIds.first !== firstId ||
			retained.partBlobIds.second !== secondId)
	) {
		throw new Error("Retained seed does not belong to this source snapshot");
	}
	const manifest =
		retained?.manifest ?? Buffer.from(await readBlob(manifestId)).toString("utf8");
	const parsed: unknown = JSON.parse(manifest);
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("format" in parsed) ||
		parsed.format !== format ||
		!("parts" in parsed) ||
		typeof parsed.parts !== "object" ||
		parsed.parts === null ||
		!("first" in parsed.parts) ||
		parsed.parts.first !== "first/document.html" ||
		!("second" in parsed.parts) ||
		parsed.parts.second !== "second/document.html" ||
		Object.keys(parsed.parts).length !== 2 ||
		Object.keys(parsed).length !== 2
	) {
		throw new Error("Unsupported manifest version or contents");
	}
	const [first, second] = await Promise.all([
		retained?.parts.first ??
			readBlob(firstId).then((bytes) => Buffer.from(bytes).toString("utf8")),
		retained?.parts.second ??
			readBlob(secondId).then((bytes) => Buffer.from(bytes).toString("utf8")),
	]);
	return {
		manifestId,
		partBlobIds: { first: firstId, second: secondId },
		manifest,
		parts: { first, second },
	};
}
