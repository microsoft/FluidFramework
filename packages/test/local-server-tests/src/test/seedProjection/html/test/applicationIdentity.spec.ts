/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import {
	createApplicationProjection,
	createProjectionManifest,
	projectionLayout,
	readApplicationProjection,
	type IApplicationProjection,
} from "../appProjection.js";
import { externalHtmlFormat } from "../htmlSeedFormat.js";
import { HtmlDocument, htmlSchemaNamespace } from "../htmlTreeSchema.js";
import { buildRuntimeSnapshot } from "../runtimeMaterialization.js";
import { htmlMaterializationProfile, htmlProjector } from "../sampleRuntimeFactory.js";
import {
	createSeedBaselineDescriptor,
	getSeedBaselineBlobId,
	readSeedBaselineDescriptor,
	seedBaselineBlobName,
	SeedBaselineMismatchError,
	SeedBaselineProtocol,
} from "../seedBaselineFingerprint.js";

/** Small named-parts source for independent application-identity tests. */
const parts = [
	{ name: "first", payload: "<p>one</p>" },
	{ name: "second", payload: "<p>two</p>" },
];

/**
 * Build an application-only storage view.
 * Its optional manifest has no authority over native construction.
 */
function sourceSnapshot(manifest: boolean): ISnapshotTree {
	return {
		blobs: {},
		trees: {
			[projectionLayout.key]: {
				blobs: {
					...(manifest ? { [projectionLayout.manifest]: "app-manifest" } : {}),
				},
				trees: {
					[projectionLayout.parts]: {
						blobs: {},
						trees: {
							first: { blobs: { "document.html": "first-html" }, trees: {} },
							second: { blobs: { "document.html": "second-html" }, trees: {} },
						},
					},
				},
			},
		},
	};
}

/**
 * Supply only application bytes through the ordinary storage read contract.
 */
async function readSource(manifest: string | undefined): Promise<IApplicationProjection> {
	const blobs = new Map([
		...parts.map(({ name, payload }): [string, string] => [`${name}-html`, payload]),
	]);
	if (manifest !== undefined) blobs.set("app-manifest", manifest);
	return readApplicationProjection(sourceSnapshot(manifest !== undefined), async (id) => {
		const content = blobs.get(id);
		assert(content !== undefined);
		return Uint8Array.from(Buffer.from(content)).buffer;
	});
}

describe("HTML application identity separation", () => {
	it("keeps external format, materialization rules, and the persisted schema namespace independent", () => {
		assert.equal(
			new Set([externalHtmlFormat, htmlMaterializationProfile, htmlSchemaNamespace]).size,
			3,
		);
		assert.equal(htmlSchemaNamespace, "fluid-html-reference/3");
		assert.equal(HtmlDocument.identifier, `${htmlSchemaNamespace}.Document`);
		assert.equal(htmlProjector.materializationProfile, htmlMaterializationProfile);
		const manifest: unknown = JSON.parse(createProjectionManifest());
		assert.deepEqual(manifest, {
			format: externalHtmlFormat,
		});
	});

	it("requires a matching profile even when both profiles produce identical native schema and bytes", async () => {
		const source = await readSource(createProjectionManifest());
		const alternate = {
			...htmlProjector,
			materializationProfile: "another-application-rule-set/1",
		};
		const first = htmlProjector.materialize(source, 0);
		const second = alternate.materialize(source, 0);
		assert.deepEqual(first.summary, second.summary);
		assert.equal(first.fingerprint, second.fingerprint);
		const expected = createSeedBaselineDescriptor(
			source,
			0,
			htmlProjector.materializationProfile,
			first.fingerprint,
		);
		const actual = createSeedBaselineDescriptor(
			source,
			0,
			alternate.materializationProfile,
			second.fingerprint,
		);
		assert.equal(expected.seedId, actual.seedId);
		assert.throws(
			() => new SeedBaselineProtocol(expected).validateProof(actual),
			SeedBaselineMismatchError,
		);
	});

	it("can change construction rules without changing the SharedTree schema namespace", async () => {
		const source = await readSource(createProjectionManifest());
		const original = htmlProjector.materialize(source, 0);
		const alternate = {
			...htmlProjector,
			materializationProfile: "application-with-wrapped-first-part/1",
			materialize: (seed: IApplicationProjection, checkpoint: number) =>
				buildRuntimeSnapshot(
					seed.parts.map(({ name, payload }) => ({
						name,
						payload: name === "first" ? `<div>${payload}</div>` : payload,
					})),
					checkpoint,
				),
		};
		const changed = alternate.materialize(source, 0);
		assert.notEqual(changed.fingerprint, original.fingerprint);
		assert.equal(HtmlDocument.identifier, `${htmlSchemaNamespace}.Document`);
		assert.notEqual(alternate.materializationProfile, htmlProjector.materializationProfile);
	});

	it("does not let application-owned manifest metadata choose native rules or a schema namespace", async () => {
		const manifest = JSON.stringify({
			title: "Application-owned document metadata",
			metadata: {
				materializationProfile: "external-metadata-is-not-a-rule-selector",
				schemaNamespace: "external-metadata-is-not-a-schema-selector",
			},
		});
		const source = await readSource(manifest);
		assert.equal(source.manifest, manifest);
		assert.deepEqual(
			htmlProjector.materialize(source, 0).summary,
			buildRuntimeSnapshot(parts, 0).summary,
		);
		assert.equal(htmlProjector.materializationProfile, htmlMaterializationProfile);
		assert.equal(HtmlDocument.identifier, `${htmlSchemaNamespace}.Document`);
	});

	it("reads and materializes named application HTML paths without a manifest", async () => {
		const source = await readSource(undefined);
		assert.equal(source.manifestId, undefined);
		assert.equal(source.manifest, undefined);
		assert.deepEqual(source.parts, parts);
		assert.deepEqual(
			htmlProjector.materialize(source, 0).summary,
			buildRuntimeSnapshot(parts, 0).summary,
		);
		const summary = createApplicationProjection(parts, { includeManifest: false });
		assert.deepEqual(Object.keys(summary.tree).sort(), [projectionLayout.parts]);
	});

	it("does not put its own compatibility descriptor into the canonical initial hash", () => {
		const baseline = buildRuntimeSnapshot(parts, 0);
		assert.equal(getSeedBaselineBlobId(baseline.snapshot), undefined);
		const exported = createApplicationProjection(parts);
		assert.equal(exported.tree[seedBaselineBlobName], undefined);
		assert.equal(exported.tree[projectionLayout.manifest]?.type, SummaryType.Blob);
	});

	it("rejects retained manifest bytes without the source blob identity", async () => {
		const source = await readSource(undefined);
		await assert.rejects(
			readApplicationProjection(
				sourceSnapshot(false),
				async () => assert.fail("Invalid retained identity must fail before storage reads"),
				{ retained: { ...source, manifest: createProjectionManifest() } },
			),
			/does not belong to this source snapshot/,
		);
	});

	it("rejects an old exported descriptor instead of silently treating it as internal compatibility state", async () => {
		const snapshot = sourceSnapshot(true);
		const projection: ISnapshotTree | undefined = snapshot.trees[projectionLayout.key];
		assert(projection !== undefined);
		projection.blobs[seedBaselineBlobName] = "old-public-descriptor";
		await assert.rejects(
			readSeedBaselineDescriptor(snapshot, async () =>
				assert.fail("Do not read compatibility metadata from exported application content"),
			),
			/missing its seed baseline fingerprint/,
		);
	});

	it("does not silently reinterpret the old manifest.work envelope as manifest-free content", async () => {
		const snapshot = sourceSnapshot(false);
		const projection: ISnapshotTree | undefined = snapshot.trees[projectionLayout.key];
		assert(projection !== undefined);
		projection.blobs["manifest.work"] = "old-app-manifest";
		await assert.rejects(
			readApplicationProjection(snapshot, async () =>
				assert.fail("Legacy application conversion must be explicit"),
			),
			/requires explicit application conversion/,
		);
	});
});
