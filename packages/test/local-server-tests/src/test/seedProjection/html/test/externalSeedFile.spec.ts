/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import {
	createProjectionManifest,
	projectionLayout,
	readApplicationProjection,
	type IApplicationProjection,
	type IHtmlPart,
} from "../appProjection.js";
import { createSeedSummary } from "../externalSeedFile.js";
import { createLocalSeedBackend } from "../../harness/index.js";

/** Two retained pieces for snapshot/cache binding tests, not an application count constraint. */
const parts: readonly IHtmlPart[] = [
	{ name: "first", payload: "<p>retained</p>" },
	{ name: "second", payload: "<p>unchanged</p>" },
];

/** Each retained dependency must independently match the snapshot before cached bytes are used. */
const mismatchedDependencies: readonly Partial<IApplicationProjection>[] = [
	{ manifestId: "another-manifest-blob" },
	{ partBlobIds: { first: "another-file", second: "second-id" } },
	{ partBlobIds: { first: "first-id", second: "second-id", extra: "extra-id" } },
	{ parts: [{ name: "first", payload: "missing second" }] },
];

/** Construct a storage-only view; reader tests must not depend on native DDS state. */
function projectionSnapshot(): ISnapshotTree {
	return {
		blobs: {},
		trees: {
			[projectionLayout.key]: {
				trees: {
					[projectionLayout.parts]: {
						blobs: {},
						trees: Object.fromEntries(
							parts.map(({ name }) => [
								name,
								{ trees: {}, blobs: { [projectionLayout.payload]: `${name}-id` } },
							]),
						),
					},
				},
				blobs: {
					[projectionLayout.manifest]: "manifest-id",
				},
			},
		},
	};
}

/** Previously read source bytes, including all IDs needed to bind them to one snapshot. */
function retainedProjection(): IApplicationProjection {
	return {
		manifestId: "manifest-id",
		partBlobIds: { first: "first-id", second: "second-id" },
		manifest: createProjectionManifest(),
		parts,
	};
}

/** Select the named-part index with checked failures for incomplete test fixtures. */
function snapshotParts(snapshot: ISnapshotTree): ISnapshotTree {
	const projection: ISnapshotTree | undefined = snapshot.trees[projectionLayout.key];
	const partTrees: ISnapshotTree | undefined = projection?.trees[projectionLayout.parts];
	assert(partTrees !== undefined);
	return partTrees;
}

describe("Seed projection reference: external file contract", () => {
	it("creates a deterministic protocol envelope with application bytes and no native graph", () => {
		const seed = createSeedSummary(parts);
		assert.deepEqual(seed, createSeedSummary([...parts].reverse()));
		assert.deepEqual(Object.keys(seed.tree).sort(), [".app", ".protocol"]);
		const app: SummaryObject | undefined = seed.tree[".app"];
		assert(app?.type === SummaryType.Tree);
		assert.deepEqual(Object.keys(app.tree), [projectionLayout.key]);
	});

	it("reuses retained bytes without any storage reads", async () => {
		const retained = retainedProjection();
		assert.deepEqual(
			await readApplicationProjection(
				projectionSnapshot(),
				async () => assert.fail("Matching retained bytes must not require a storage read"),
				{ retained },
			),
			retained,
		);
	});

	for (const changed of mismatchedDependencies) {
		it(`rejects mismatched retained dependencies ${JSON.stringify(changed)}`, async () => {
			await assert.rejects(
				readApplicationProjection(
					projectionSnapshot(),
					async () => assert.fail("Mismatched IDs must fail before reads"),
					{ retained: { ...retainedProjection(), ...changed } },
				),
				/does not belong/,
			);
		});
	}

	it("retains opaque manifest metadata without requiring or interpreting its format identifier", async () => {
		const retained = {
			...retainedProjection(),
			manifest: '{"format":"application-defined-metadata","custom":true}',
		};
		assert.deepEqual(
			await readApplicationProjection(
				projectionSnapshot(),
				async () => assert.fail("No reads expected"),
				{ retained },
			),
			retained,
		);
	});

	it("reads an explicit empty parts tree without any blobs or identity metadata", async () => {
		const projection = await readApplicationProjection(
			{
				blobs: {},
				trees: {
					[projectionLayout.key]: {
						blobs: {},
						trees: { [projectionLayout.parts]: { trees: {}, blobs: {} } },
					},
				},
			},
			async () => assert.fail("An empty application document needs no blob reads"),
		);
		assert.deepEqual(projection.parts, []);
		assert.deepEqual(projection.partBlobIds, {});
		assert.equal(projection.manifestId, undefined);
		assert.equal(projection.manifest, undefined);
	});

	it("rejects old fixed-part layouts even if no manifest was supplied", async () => {
		await assert.rejects(
			readApplicationProjection(
				{
					blobs: {},
					trees: {
						[projectionLayout.key]: {
							blobs: {},
							trees: {
								first: { blobs: { "document.html": "first-id" }, trees: {} },
								second: { blobs: { "document.html": "second-id" }, trees: {} },
							},
						},
					},
				},
				async () => assert.fail("Old layouts require explicit conversion"),
			),
			/old prototype layouts/,
		);
	});

	it("rejects snapshots without the application projection", async () => {
		await assert.rejects(
			readApplicationProjection({ trees: {}, blobs: {} }, async () =>
				assert.fail("Missing projection must fail before reads"),
			),
			/Not a supported seed envelope/,
		);
	});

	for (const count of [0, 1, 2, 4]) {
		it(`creates and reads ${count} parts without constructing a runtime`, async () => {
			const backend = createLocalSeedBackend();
			try {
				const input = Array.from({ length: count }, (_, index) => ({
					name: `part-${index}`,
					payload: `<p>${index}</p>`,
				}));
				const url = await backend.create(createSeedSummary(input));
				const otherUrl = await backend.create(createSeedSummary(input));
				assert.notEqual(url, otherUrl);
				const inspection = await backend.inspect(url);
				try {
					const projection = await readApplicationProjection(
						inspection.snapshot.snapshotTree,
						inspection.readBlob,
					);
					assert.deepEqual(projection.parts, input);
					assert.equal(projection.manifest, createProjectionManifest());
				} finally {
					inspection.dispose();
				}
				assert.equal(backend.uploads.length, 0);
			} finally {
				await backend.close();
			}
		});
	}

	it("rejects a named subtree without its payload before reading any bodies", async () => {
		const snapshot = projectionSnapshot();
		const second: ISnapshotTree | undefined = snapshotParts(snapshot).trees.second;
		assert(second !== undefined);
		Reflect.deleteProperty(second.blobs, projectionLayout.payload);
		await assert.rejects(
			readApplicationProjection(snapshot, async () => assert.fail("No reads expected")),
			/missing part payload/,
		);
	});

	for (const name of [
		"",
		"../outside",
		"a/b",
		String.raw`a\b`,
		".",
		"__proto__",
		"constructor",
		"prototype",
		"name\n",
		"Ä",
		"a".repeat(65),
	]) {
		it(`rejects unsafe part names before summary construction: ${JSON.stringify(name)}`, () => {
			assert.throws(
				() => createSeedSummary([{ name, payload: "<p>safe</p>" }]),
				/unsafe HTML part name/,
			);
		});
	}

	it("rejects duplicate names instead of overwriting a subtree", () => {
		assert.throws(() => createSeedSummary([...parts, parts[0]]), /Duplicate/);
	});

	it("rejects unsafe stored paths as well as producer input", async () => {
		const snapshot = projectionSnapshot();
		snapshotParts(snapshot).trees["../outside"] = {
			trees: {},
			blobs: { [projectionLayout.payload]: "unsafe-id" },
		};
		await assert.rejects(
			readApplicationProjection(snapshot, async () => assert.fail("No reads expected")),
			/unsafe HTML part name/,
		);
	});
});
