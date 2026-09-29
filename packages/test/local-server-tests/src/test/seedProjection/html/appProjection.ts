/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentStorageService,
	ISnapshotTree,
	ISummaryTree,
} from "@fluidframework/driver-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import { externalHtmlFormat } from "./htmlSeedFormat.js";

/**
 * Application-owned storage layout, shared by the external writer, runtime projection, and reader.
 * The required parts subtree distinguishes this layout from the earlier fixed-field prototype.
 * An empty parts subtree is a complete empty document; no manifest or format-identity blob is required.
 */
export const projectionLayout = {
	key: "applicationProjection",
	group: "application-projection",
	manifest: "manifest.json",
	parts: "parts",
	payload: "document.html",
} as const;

/**
 * Runtime package selected by the seed's protocol metadata and the application's code loader.
 * This fixture version loads the named-parts model, not the earlier fixed-field prototype.
 */
export const codeDetails = { package: "seed-projection-reference/3" };

/** Safe single path segments; ASCII spelling also makes code-unit sorting independent of locale. */
const partNamePattern = /^[a-z][a-z0-9_-]{0,63}$/u;
/** Exclude JavaScript object prototype keys before names reach summary tree dictionaries. */
const reservedPartNames = new Set(["constructor", "prototype"]);

/**
 * One independently editable and independently stored piece of application content.
 * Names identify parts; array enumeration order has no meaning in this application.
 */
export interface IHtmlPart {
	/** Unique safe storage-path segment, validated by {@link canonicalParts}. */
	readonly name: string;
	/** Restricted HTML, stored unchanged by the producer and canonicalized by runtime projection. */
	readonly payload: string;
}

/**
 * Validate all names before allocating summary trees or model nodes, then sort by code units.
 * Reject duplicates rather than silently replacing a part with another part of the same name.
 * @typeParam TPart - A named payload or model entry whose remaining fields are preserved.
 */
export function canonicalParts<TPart extends { readonly name: string }>(
	parts: readonly TPart[],
): TPart[] {
	const names = new Set<string>();
	for (const { name } of parts) {
		if (
			partNamePattern.exec(name)?.[0] !== name ||
			reservedPartNames.has(name) ||
			names.has(name)
		) {
			throw new Error(`Duplicate or unsafe HTML part name: ${name}`);
		}
		names.add(name);
	}
	return [...parts].sort((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
	);
}

/**
 * Default document metadata chosen by this application.
 * Producers may omit it or supply opaque custom metadata; the part index is the parts subtree, not this blob.
 * The default describes the format only, so retained bytes never advertise a stale part inventory.
 */
export function createProjectionManifest(): string {
	return JSON.stringify({ format: externalHtmlFormat });
}

/**
 * Create shared projection metadata without inspecting or serializing any HTML.
 * Both the external writer and the live summary projection use this exact envelope.
 */
export function createProjectionTree(manifest: string | undefined): SummaryTreeBuilder {
	const projection = new SummaryTreeBuilder({ groupId: projectionLayout.group });
	if (manifest !== undefined) projection.addBlob(projectionLayout.manifest, manifest);
	return projection;
}

/**
 * Payload and storage identities retained from one application projection.
 * Cached bytes may only be used with the same optional manifest and named payload blob IDs.
 */
export interface IApplicationProjection {
	/** ID of the application's optional metadata blob. */
	readonly manifestId?: string;
	/** Original metadata bytes, not a selector for runtime construction rules. */
	readonly manifest?: string;
	/** Storage IDs keyed by part name, not collaborative node identities. */
	readonly partBlobIds: Readonly<Record<string, string>>;
	/** Original HTML, in canonical name order; reading does not materialize a DDS. */
	readonly parts: readonly IHtmlPart[];
}

/**
 * Create the readable application tree shared by external creation and summary generation.
 * Names, not positions, define reusable subtrees; zero parts represents an empty document.
 */
export function createApplicationProjection(
	parts: readonly IHtmlPart[],
	options: { includeManifest?: boolean; manifest?: string } = {},
): ISummaryTree {
	const ordered = canonicalParts(parts);
	const projection = createProjectionTree(
		options.includeManifest === false
			? undefined
			: (options.manifest ?? createProjectionManifest()),
	);
	const partTrees = new SummaryTreeBuilder();
	for (const { name, payload } of ordered) {
		const part = new SummaryTreeBuilder();
		part.addBlob(projectionLayout.payload, payload);
		partTrees.addWithStats(name, part);
	}
	projection.addWithStats(projectionLayout.parts, partTrees);
	return projection.summary;
}

/**
 * Read a seed or runtime summary without loading a Fluid runtime.
 * The required parts subtree rejects older fixed-field prototype layouts explicitly.
 * The optional manifest remains opaque application metadata, including custom fields and formatting.
 */
export async function readApplicationProjection(
	snapshot: ISnapshotTree,
	readBlob: IDocumentStorageService["readBlob"],
	options: { retained?: IApplicationProjection } = {},
): Promise<IApplicationProjection> {
	const projection: ISnapshotTree | undefined = snapshot.trees[projectionLayout.key];
	if (projection?.blobs["manifest.work"] !== undefined) {
		throw new Error("Legacy manifest.work requires explicit application conversion");
	}
	const partTrees = projection?.trees[projectionLayout.parts];
	if (partTrees === undefined) {
		throw new Error("Not a supported seed envelope; old prototype layouts require conversion");
	}
	const ordered = canonicalParts(
		Object.entries(partTrees.trees).map(([name, tree]) => ({
			name,
			blobId: tree.blobs[projectionLayout.payload],
		})),
	);
	if (ordered.some(({ blobId }) => blobId === undefined)) {
		throw new Error("Not a supported seed envelope: missing part payload");
	}
	const partBlobIds = Object.fromEntries(ordered.map(({ name, blobId }) => [name, blobId]));
	const manifestId = projection?.blobs[projectionLayout.manifest];
	const retained = options.retained;
	if (
		retained !== undefined &&
		(retained.manifestId !== manifestId ||
			(retained.manifestId === undefined) !== (retained.manifest === undefined) ||
			JSON.stringify(canonicalParts(retained.parts).map(({ name }) => name)) !==
				JSON.stringify(ordered.map(({ name }) => name)) ||
			Object.keys(retained.partBlobIds).length !== ordered.length ||
			ordered.some(({ name, blobId }) => retained.partBlobIds[name] !== blobId))
	) {
		throw new Error("Retained seed does not belong to this source snapshot");
	}
	const manifest =
		manifestId === undefined
			? undefined
			: (retained?.manifest ?? Buffer.from(await readBlob(manifestId)).toString("utf8"));
	const cached = new Map(retained?.parts.map(({ name, payload }) => [name, payload]));
	const parts = await Promise.all(
		ordered.map(async ({ name, blobId }) => ({
			name,
			payload: cached.get(name) ?? Buffer.from(await readBlob(blobId)).toString("utf8"),
		})),
	);
	return { manifestId, manifest, partBlobIds, parts };
}
