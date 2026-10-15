/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	type CodecWriteOptions,
	FluidClientVersion,
	FormatValidatorNoOp,
} from "../../../codec/index.js";
import type { TreeStoredSchema } from "../../../core/index.js";
import { schemaCodecBuilder } from "../../../feature-libraries/index.js";
import {
	createIndependentTreeAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../shared-tree/independentView.js";
import { SchematizingSimpleTreeView } from "../../../shared-tree/index.js";
import {
	computeViewSchemaHash,
	computeSchemaHash,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	TreeViewConfigurationAlpha,
	type ITreeViewConfigurationAlpha,
	toInitialSchema,
	exportCompatibilitySchemaSnapshot,
	asTreeViewAlpha,
} from "../../../simple-tree/index.js";
import {
	jsonTreeFromCheckout,
	testIdCompressor,
	TestTreeProviderLite,
	TestTreeProvider,
	SummarizeType,
} from "../../utils.js";

const factory = new SchemaFactoryAlpha("schema-hash");

function getSchemaHashInput(schema: TreeStoredSchema) {
	return schemaCodecBuilder
		.build({
			minVersionForCollab: FluidClientVersion.v2_0,
			jsonValidator: FormatValidatorNoOp,
		})
		.encode(schema);
}

function computeMetadataHash(schema: Parameters<typeof computeViewSchemaHash>[0]) {
	return computeViewSchemaHash(schema, undefined, {
		minVersionForCollab: FluidClientVersion.v2_43,
	});
}

function schemaFromView(view: unknown) {
	assert(view instanceof SchematizingSimpleTreeView);
	return view.checkout.storedSchema.clone();
}

function storedContent(view: unknown) {
	assert(view instanceof SchematizingSimpleTreeView);
	return jsonTreeFromCheckout(view.checkout);
}

function clearExpectedError(view: unknown): void {
	assert(view instanceof SchematizingSimpleTreeView);
	// Validation fails before any edit; clear the expected error to inspect the unchanged document.
	view.breaker.clearError();
}

describe("runtime schema hashes", () => {
	for (const encodingOptions of [
		{ minVersionForCollab: FluidClientVersion.v2_0 },
		{ minVersionForCollab: FluidClientVersion.v2_43 },
		{
			minVersionForCollab: FluidClientVersion.v2_43,
			writeVersionOverrides: new Map([["Schema", 1]]),
		},
		{
			minVersionForCollab: FluidClientVersion.v2_0,
			writeVersionOverrides: new Map([["Schema", 2]]),
			allowPossiblyIncompatibleWriteVersionOverrides: true,
		},
	] satisfies Partial<CodecWriteOptions>[]) {
		it(`uses the tree's schema encoding with ${JSON.stringify(encodingOptions)}`, () => {
			const schema = factory.required(factory.number, {
				persistedMetadata: { note: "included when supported" },
			});
			const encoder = schemaCodecBuilder.build({
				...encodingOptions,
				jsonValidator: FormatValidatorNoOp,
			});
			const hash = computeViewSchemaHash(schema, undefined, encodingOptions);
			assert.equal(hash, computeSchemaHash(encoder.encode(toInitialSchema(schema))));
			const tree = createIndependentTreeAlpha({
				...encodingOptions,
				idCompressor: testIdCompressor,
			});
			const view = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema,
					schemaIdentity: { schemaHash: hash, schemaHasher: computeSchemaHash },
				}),
			);
			view.initialize(1);
			view.upgradeSchema();
			asTreeViewAlpha(view).fork().upgradeSchema();
		});
	}

	it("includes only metadata retained by the selected encoder", () => {
		const schema = factory.required(factory.number, {
			persistedMetadata: { note: "metadata" },
		});
		assert.equal(computeViewSchemaHash(schema), computeViewSchemaHash(factory.number));
		assert.notEqual(computeMetadataHash(schema), computeMetadataHash(factory.number));
	});

	it("uses hexadecimal SHA-256 with a canonical representation", () => {
		const canonical = '{"a":[2,1],"z":{"a":1,"b":2}}';
		assert.equal(
			computeSchemaHash({ z: { b: 2, a: 1 }, a: [2, 1] }),
			createHash("sha256").update(canonical).digest("hex"),
		);
		assert.match(computeSchemaHash({ a: 1 }), /^[0-9a-f]{64}$/);
		assert.notEqual(computeSchemaHash({ a: [1, 2] }), computeSchemaHash({ a: [2, 1] }));
	});

	it("ignores object, field, definition and allowed-type insertion order", () => {
		const a = factory.object("Object", {
			a: factory.optional([factory.string, factory.number]),
			b: factory.boolean,
		});
		const b = factory.object("Object", {
			b: factory.boolean,
			a: factory.optional([factory.number, factory.string]),
		});
		assert.equal(computeViewSchemaHash(a), computeViewSchemaHash(b));
		assert.equal(
			computeViewSchemaHash([a, factory.null]),
			computeViewSchemaHash([factory.null, b]),
		);
	});

	it("includes persisted node and field metadata but excludes view-only metadata", () => {
		const a = factory.object("Object", {}, { metadata: { description: "a" } });
		const b = factory.object("Object", {}, { metadata: { description: "b" } });
		assert.equal(computeMetadataHash(a), computeMetadataHash(b));
		const nodeMetadata = factory.objectAlpha(
			"Object",
			{},
			{ persistedMetadata: { note: "a" } },
		);
		assert.notEqual(computeMetadataHash(a), computeMetadataHash(nodeMetadata));
		const rootMetadata = factory.required(factory.number, {
			persistedMetadata: { note: "a" },
		});
		assert.notEqual(computeMetadataHash(factory.number), computeMetadataHash(rootMetadata));
		const fieldMetadata = factory.object("Object", {
			a: factory.required(factory.number, { persistedMetadata: { note: "a" } }),
		});
		assert.notEqual(
			computeMetadataHash(factory.object("Object", { a: factory.number })),
			computeMetadataHash(fieldMetadata),
		);
	});

	it("canonicalizes metadata objects without reordering metadata arrays or type-like keys", () => {
		const a = factory.required(factory.number, {
			persistedMetadata: { a: 1, b: { types: ["b", "a"] } },
		});
		const b = factory.required(factory.number, {
			persistedMetadata: { b: { types: ["b", "a"] }, a: 1 },
		});
		const c = factory.required(factory.number, {
			persistedMetadata: { a: 1, b: { types: ["a", "b"] } },
		});
		assert.equal(computeMetadataHash(a), computeMetadataHash(b));
		assert.notEqual(computeMetadataHash(a), computeMetadataHash(c));
	});

	it("hashes the effective staged schema", () => {
		const root = factory.types([factory.number, factory.staged(factory.string)]);
		assert.equal(computeViewSchemaHash(root), computeViewSchemaHash(factory.number));
		assert.equal(
			computeViewSchemaHash(root, StagedSchemaUpgradePolicy.permissive),
			computeViewSchemaHash([factory.number, factory.string]),
		);
		assert.notEqual(
			computeViewSchemaHash(root),
			computeViewSchemaHash(root, StagedSchemaUpgradePolicy.permissive),
		);
		const object = factory.object("Staged", {
			a: factory.number,
			b: factory.stagedOptional(factory.string),
		});
		assert.notEqual(
			computeViewSchemaHash(object),
			computeViewSchemaHash(object, StagedSchemaUpgradePolicy.permissive),
		);
	});

	it("initializes and upgrades without persisting hashes", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaIdentity: {
					schemaHash: computeViewSchemaHash(factory.number),
					schemaHasher: computeSchemaHash,
				},
			}),
		);
		initial.initialize(1);
		assert.deepEqual(
			getSchemaHashInput(schemaFromView(initial)),
			getSchemaHashInput(toInitialSchema(factory.number)),
		);
		initial.dispose();
		const schema = [factory.number, factory.string];
		const config = new TreeViewConfigurationAlpha({
			schema,
			schemaIdentity: {
				schemaHash: computeViewSchemaHash(schema),
				schemaHasher: computeSchemaHash,
			},
		});
		const next = tree.viewWith(config);
		next.upgradeSchema();
		assert.equal(next.root, 1);
		assert.deepEqual(
			getSchemaHashInput(schemaFromView(next)),
			getSchemaHashInput(toInitialSchema(schema)),
		);
		assert.deepEqual(
			exportCompatibilitySchemaSnapshot(config),
			exportCompatibilitySchemaSnapshot(new TreeViewConfigurationAlpha({ schema })),
		);
		assert.equal("schemaHash" in schemaFromView(next), false);
		assert.equal("schemaHash" in tree.exportSimpleSchema(), false);
		assert.equal("schemaIdentity" in schemaFromView(next), false);
		assert.equal("schemaIdentity" in tree.exportSimpleSchema(), false);
	});

	it("validates staged upgrades already enabled in the document, even on no-op upgrades", () => {
		const schema = factory.types([factory.number, factory.staged(factory.string)]);
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.permissive,
				schemaIdentity: {
					schemaHash: computeViewSchemaHash(schema, StagedSchemaUpgradePolicy.permissive),
					schemaHasher: computeSchemaHash,
				},
			}),
		);
		initial.initialize("enabled");
		initial.dispose();
		for (const valid of [false, true]) {
			const next = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema,
					stagedUpgradePolicy: {
						...StagedSchemaUpgradePolicy.restrictive,
						includeAlreadyEnabledUpgrades: true,
					},
					schemaIdentity: {
						schemaHash: computeViewSchemaHash(
							schema,
							valid ? StagedSchemaUpgradePolicy.permissive : undefined,
						),
						schemaHasher: computeSchemaHash,
					},
				}),
			);
			let changes = 0;
			next.events.on("commitApplied", () => changes++);
			const beforeSchema = schemaFromView(next);
			const beforeContent = storedContent(next);
			if (valid) {
				next.upgradeSchema();
			} else {
				assert.throws(
					() => next.upgradeSchema(),
					validateUsageError(/Schema hash does not match/),
				);
				clearExpectedError(next);
			}
			assert.equal(changes, 0);
			assert.deepEqual(schemaFromView(next), beforeSchema);
			assert.deepEqual(storedContent(next), beforeContent);
			assert.equal(next.root, "enabled");
			next.dispose();
		}
	});

	for (const operation of [
		"initialization",
		"equivalent upgrade",
		"additive upgrade",
	] as const) {
		for (const failure of ["incorrect hash", "mismatched encoding", "hasher error"] as const) {
			it(`rejects ${failure} before ${operation}`, () => {
				const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
				if (operation !== "initialization") {
					const initial = tree.viewWith(
						new TreeViewConfigurationAlpha({ schema: factory.number }),
					);
					initial.initialize(1);
					initial.dispose();
				}
				const schema =
					operation === "additive upgrade" ? [factory.number, factory.string] : factory.number;
				const error = new Error("Hasher failed");
				const view = tree.viewWith(
					new TreeViewConfigurationAlpha({
						schema,
						schemaIdentity: {
							schemaHash:
								failure === "mismatched encoding" ? computeMetadataHash(schema) : "stale",
							schemaHasher:
								failure === "hasher error"
									? () => {
											throw error;
										}
									: computeSchemaHash,
						},
					}),
				);
				let changes = 0;
				view.events.on("commitApplied", () => changes++);
				const beforeSchema = schemaFromView(view);
				const beforeContent = storedContent(view);
				assert.throws(
					() => (operation === "initialization" ? view.initialize(1) : view.upgradeSchema()),
					failure === "hasher error"
						? (thrown: unknown) => thrown === error
						: validateUsageError(/Schema hash does not match/),
				);
				clearExpectedError(view);
				assert.equal(changes, 0);
				assert.deepEqual(schemaFromView(view), beforeSchema);
				assert.deepEqual(storedContent(view), beforeContent);
				assert.equal(view.compatibility.canInitialize, operation === "initialization");
			});
		}
	}

	it("allows later clients to omit hashing even after hashed initialization", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaIdentity: {
					schemaHash: computeViewSchemaHash(factory.number),
					schemaHasher: computeSchemaHash,
				},
			}),
		);
		initial.initialize(1);
		initial.dispose();
		const next = tree.viewWith(
			new TreeViewConfigurationAlpha({ schema: [factory.number, factory.string] }),
		);
		next.upgradeSchema();
		assert.equal(next.root, 1);
	});

	it("does not require hashes on collaborating clients receiving schema ops", () => {
		const provider = new TestTreeProviderLite(2);
		const [local, remote] = provider.trees;
		const initial = local.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaIdentity: {
					schemaHash: computeMetadataHash(factory.number),
					schemaHasher: computeSchemaHash,
				},
			}),
		);
		initial.initialize(1);
		provider.synchronizeMessages();
		initial.dispose();
		const schema = [factory.number, factory.string];
		const upgraded = local.viewWith(
			new TreeViewConfigurationAlpha({
				schema,
				schemaIdentity: {
					schemaHash: computeMetadataHash(schema),
					schemaHasher: computeSchemaHash,
				},
			}),
		);
		upgraded.upgradeSchema();
		provider.synchronizeMessages();
		const remoteView = remote.viewWith(new TreeViewConfigurationAlpha({ schema }));
		assert.equal(remoteView.compatibility.isEquivalent, true);
		remoteView.upgradeSchema();
		assert.equal(remoteView.root, 1);
		assert.equal("schemaHash" in remote.exportSimpleSchema(), false);
		assert.equal("schemaHash" in schemaFromView(remoteView), false);
	});

	it("loads a summary initialized with hash validation without runtime hashing configuration", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const config = new TreeViewConfigurationAlpha({
			schema: factory.number,
			schemaIdentity: {
				schemaHash: computeMetadataHash(factory.number),
				schemaHasher: computeSchemaHash,
			},
		});
		provider.trees[0].viewWith(config).initialize(1);
		await provider.ensureSynchronized();
		await provider.summarize();
		await provider.ensureSynchronized();
		const loaded = await provider.createTree();
		const view = asTreeViewAlpha(
			loaded.viewWith(new TreeViewConfigurationAlpha({ schema: factory.number })),
		);
		assert.equal(view.compatibility.isEquivalent, true);
		view.upgradeSchema();
		assert.equal(view.root, 1);
		assert.equal("schemaHash" in schemaFromView(view), false);
		assert.equal("schemaHash" in loaded.exportSimpleSchema(), false);
	});

	it("invokes an injected hasher only when writing schema", () => {
		let calls = 0;
		const config = new TreeViewConfigurationAlpha({
			schema: factory.number,
			schemaIdentity: {
				schemaHash: "custom",
				schemaHasher: (input) => {
					assert.deepEqual(input, getSchemaHashInput(toInitialSchema(factory.number)));
					calls++;
					return "custom";
				},
			},
		});
		exportCompatibilitySchemaSnapshot(config);
		assert.equal(calls, 0);
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const view = tree.viewWith(config);
		assert.equal(calls, 0);
		view.initialize(1);
		assert.equal(calls, 1);
		let changes = 0;
		view.events.on("commitApplied", () => changes++);
		view.upgradeSchema();
		assert.equal(calls, 2);
		assert.equal(changes, 0);
	});

	it("rejects incomplete or malformed schema identities", () => {
		for (const schemaIdentity of [
			null,
			"invalid",
			{},
			{ schemaHash: computeViewSchemaHash(factory.number) },
			{ schemaHasher: computeSchemaHash },
			{ schemaHash: "", schemaHasher: computeSchemaHash },
			{ schemaHash: 1, schemaHasher: computeSchemaHash },
			{ schemaHash: "custom", schemaHasher: "invalid" },
		]) {
			const config = { schema: factory.number, schemaIdentity };
			assert.throws(
				() => new TreeViewConfigurationAlpha(config as ITreeViewConfigurationAlpha),
				validateUsageError(/schemaIdentity.*must/),
			);
		}
	});

	it("requires both identity properties at compile time", () => {
		const hash = computeViewSchemaHash(factory.number);
		const hashOnly: ITreeViewConfigurationAlpha = {
			schema: factory.number,
			// @ts-expect-error A schema identity requires a hasher.
			schemaIdentity: { schemaHash: hash },
		};
		const hasherOnly: ITreeViewConfigurationAlpha = {
			schema: factory.number,
			// @ts-expect-error A schema identity requires an expected hash.
			schemaIdentity: { schemaHasher: computeSchemaHash },
		};
		assert.throws(
			() => new TreeViewConfigurationAlpha(hashOnly),
			validateUsageError(/schemaIdentity.schemaHasher must/),
		);
		assert.throws(
			() => new TreeViewConfigurationAlpha(hasherOnly),
			validateUsageError(/schemaIdentity.schemaHash must/),
		);
	});

	it("copies the identity so later input changes cannot disable validation", () => {
		const identity = {
			schemaHash: computeViewSchemaHash(factory.number),
			schemaHasher: computeSchemaHash,
		};
		const config = new TreeViewConfigurationAlpha({
			schema: factory.number,
			schemaIdentity: identity,
		});
		identity.schemaHash = "changed";
		identity.schemaHasher = () => "changed";
		assert.equal(Object.isFrozen(config.schemaIdentity), true);
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const view = tree.viewWith(config);
		view.initialize(1);
		assert.equal(view.root, 1);
	});
});
