/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import {
	createSeedSummary,
	projectionKey,
	readApplicationProjection,
	type ApplicationProjection,
} from "./externalSeedFile.js";
import { format } from "./htmlSeedFormat.js";
import { createLocalSeedBackend } from "./localSeedWorkflowBackend.js";

/** Construct an ID-only storage view so reader tests cannot accidentally depend on native DDS state. */
function projectionSnapshot(): ISnapshotTree {
	return {
		blobs: {},
		trees: {
			[projectionKey]: {
				trees: {},
				blobs: { "manifest.work": "manifest-id", "document.html": "html-id" },
			},
		},
	};
}

/** Represent previously read source bytes, including the IDs required to bind them to one snapshot. */
function retainedProjection(): ApplicationProjection {
	return {
		manifestId: "manifest-id",
		htmlId: "html-id",
		manifest: JSON.stringify({ format, html: "document.html" }),
		html: "<p>retained</p>",
	};
}

// Exercise the external-producer/readback contract without constructing any application runtime or DDS.
describe("Seed projection reference: external file contract", () => {
	// Repeated creation describes the same envelope; storage, not this serializer, assigns a file identity.
	it("creates a deterministic protocol envelope with application bytes and no native graph", () => {
		const seed = createSeedSummary("<p>external</p>");
		assert.deepEqual(seed, createSeedSummary("<p>external</p>"));
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
				{ retained: { ...retainedProjection(), htmlId: "another-file" } },
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
						manifest: '{"format":"future","html":"document.html"}',
					},
				},
			),
			/Unsupported manifest/,
		);
	});

	// Both IDs are required to distinguish an application projection from an unrelated snapshot subtree.
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
			const first = await backend.create(createSeedSummary("<p>first</p>"));
			const second = await backend.create(createSeedSummary("<p>second</p>"));
			assert.notEqual(first, second);
			for (const { url, html } of [
				{ url: first, html: "<p>first</p>" },
				{ url: second, html: "<p>second</p>" },
			]) {
				const inspection = await backend.inspect(url);
				try {
					const projection = await readApplicationProjection(
						inspection.snapshot.snapshotTree,
						inspection.readBlob,
					);
					assert.equal(projection.html, html);
					assert.deepEqual(JSON.parse(projection.manifest), { format, html: "document.html" });
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
});
