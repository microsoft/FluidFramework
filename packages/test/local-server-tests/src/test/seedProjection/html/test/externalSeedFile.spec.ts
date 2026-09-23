/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import {
	createSeedSummary,
	createProjectionManifest,
	projectionKey,
	readApplicationProjection,
	type IApplicationProjection,
} from "../externalSeedFile.js";
import { format } from "../htmlSeedFormat.js";
import { createLocalSeedBackend } from "../../harness/index.js";

/** Construct an ID-only storage view so reader tests cannot accidentally depend on native DDS state. */
function projectionSnapshot(): ISnapshotTree {
	return {
		blobs: {},
		trees: {
			[projectionKey]: {
				trees: {
					first: { trees: {}, blobs: { "document.html": "first-id" } },
					second: { trees: {}, blobs: { "document.html": "second-id" } },
				},
				blobs: { "manifest.work": "manifest-id" },
			},
		},
	};
}

/** Represent previously read source bytes, including the IDs required to bind them to one snapshot. */
function retainedProjection(): IApplicationProjection {
	return {
		manifestId: "manifest-id",
		partBlobIds: { first: "first-id", second: "second-id" },
		manifest: createProjectionManifest(),
		parts: { first: "<p>retained</p>", second: "<p>unchanged</p>" },
	};
}

// Exercise the external-producer/readback contract without constructing any application runtime or DDS.
describe("Seed projection reference: external file contract", () => {
	// Repeated creation describes the same envelope; storage, not this serializer, assigns a file identity.
	it("creates a deterministic protocol envelope with application bytes and no native graph", () => {
		const parts = { first: "<p>external</p>", second: "<p>second</p>" };
		const seed = createSeedSummary(parts);
		assert.deepEqual(seed, createSeedSummary(parts));
		assert.deepEqual(Object.keys(seed.tree).sort(), [".app", ".protocol"]);
		const app: SummaryObject | undefined = seed.tree[".app"];
		assert(app?.type === SummaryType.Tree);
		assert.deepEqual(Object.keys(app.tree), [projectionKey]);
	});

	// Restoration may read no storage bodies, but only when the retained IDs match the requested snapshot.
	it("reuses retained bytes without storage reads", async () => {
		const retained = retainedProjection();
		const result = await readApplicationProjection(
			projectionSnapshot(),
			async () => assert.fail("Matching retained bytes must not require a storage read"),
			{ retained },
		);
		assert.deepEqual(result, retained);
	});

	// A different snapshot must not accept content merely because its application format is the same.
	it("rejects retained bytes from another snapshot before reading storage", async () => {
		await assert.rejects(
			readApplicationProjection(
				projectionSnapshot(),
				async () => assert.fail("Mismatched retained IDs must fail before storage reads"),
				{
					retained: {
						...retainedProjection(),
						partBlobIds: { first: "another-file", second: "second-id" },
					},
				},
			),
			/does not belong/,
		);
	});

	// Native runtime metadata does not make an unsupported readable projection format acceptable.
	it("rejects an unsupported retained manifest rather than interpreting a different protocol", async () => {
		await assert.rejects(
			readApplicationProjection(
				projectionSnapshot(),
				async () => assert.fail("Invalid retained manifest must fail before body reads"),
				{
					retained: {
						...retainedProjection(),
						manifest: '{"format":"future","parts":{}}',
					},
				},
			),
			/Unsupported manifest/,
		);
	});

	// All IDs are required to distinguish an application projection from an unrelated snapshot subtree.
	it("rejects snapshots without the application payload", async () => {
		await assert.rejects(
			readApplicationProjection({ trees: {}, blobs: {} }, async () =>
				assert.fail("Missing projection must fail before storage reads"),
			),
			/Not a supported seed envelope/,
		);
	});

	// One backend serves multiple files; each app-only read must return its own stored content without initialization.
	it("creates and reads two independent files through the same backend", async () => {
		const backend = createLocalSeedBackend();
		try {
			const firstParts = { first: "<p>first document</p>", second: "<p>one</p>" };
			const secondParts = { first: "<p>second document</p>", second: "<p>two</p>" };
			const first = await backend.create(createSeedSummary(firstParts));
			const second = await backend.create(createSeedSummary(secondParts));
			assert.notEqual(first, second);
			for (const { url, parts } of [
				{ url: first, parts: firstParts },
				{ url: second, parts: secondParts },
			]) {
				const inspection = await backend.inspect(url);
				try {
					const projection = await readApplicationProjection(
						inspection.snapshot.snapshotTree,
						inspection.readBlob,
					);
					assert.deepEqual(projection.parts, parts);
					assert.deepEqual(JSON.parse(projection.manifest), {
						format,
						parts: { first: "first/document.html", second: "second/document.html" },
					});
				} finally {
					inspection.dispose();
				}
			}
			assert.equal(
				backend.uploads.length,
				0,
				"External creation is not a client summary upload",
			);
		} finally {
			await backend.close();
		}
	});

	// Retained content for one part must not hide an incomplete second part in the source snapshot.
	it("rejects a seed missing either HTML subtree", async () => {
		const snapshot = projectionSnapshot();
		const projection: ISnapshotTree | undefined = snapshot.trees[projectionKey];
		assert(projection !== undefined);
		delete projection.trees.second;
		await assert.rejects(
			readApplicationProjection(snapshot, async () =>
				assert.fail("Missing IDs must fail before reads"),
			),
			/Not a supported seed envelope/,
		);
	});

	// Documented paths are fixed in this version, rather than trusted filesystem or arbitrary blob references.
	it("rejects an incompatible part mapping in the manifest", async () => {
		await assert.rejects(
			readApplicationProjection(
				projectionSnapshot(),
				async () => assert.fail("No reads expected"),
				{
					retained: {
						...retainedProjection(),
						manifest: JSON.stringify({
							format,
							parts: { first: "../other", second: "second/document.html" },
						}),
					},
				},
			),
			/Unsupported manifest/,
		);
	});
});
