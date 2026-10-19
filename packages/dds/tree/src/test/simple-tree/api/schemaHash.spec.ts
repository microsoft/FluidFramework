/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";

import { TreeStoredSchemaRepository, type LibraryId } from "../../../core/index.js";
import {
	createIndependentTreeAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../shared-tree/independentView.js";
import {
	computeSchemaHash,
	schemaHasher,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	TreeViewConfigurationAlpha,
	asTreeViewAlpha,
	toInitialSchema,
	exportCompatibilitySchemaSnapshot,
	importCompatibilitySchemaSnapshot,
	getSchemaHashInput,
} from "../../../simple-tree/index.js";
import {
	SharedTreeTestFactory,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
	testIdCompressor,
} from "../../utils.js";

const factory = new SchemaFactoryAlpha("schema-hash");
const libraryId = "com.example" as LibraryId;
const versions = { [libraryId]: 1 };

describe("schema hashes", () => {
	it("uses hexadecimal SHA-256 with a canonical representation", () => {
		const canonical = '{"a":[2,1],"z":{"a":1,"b":2}}';
		assert.equal(
			schemaHasher({ z: { b: 2, a: 1 }, a: [2, 1] }),
			createHash("sha256").update(canonical).digest("hex"),
		);
		assert.match(schemaHasher({ a: 1 }), /^[0-9a-f]{64}$/);
		assert.notEqual(schemaHasher({ a: [1, 2] }), schemaHasher({ a: [2, 1] }));
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
		assert.equal(computeSchemaHash(a), computeSchemaHash(b));
	});

	it("includes persisted metadata but excludes view metadata and versions", () => {
		const a = factory.object("Object", {}, { metadata: { description: "a" } });
		const b = factory.object("Object", {}, { metadata: { description: "b" } });
		assert.equal(computeSchemaHash(a), computeSchemaHash(b));
		const stored = toInitialSchema(factory.number);
		const changed = {
			...stored,
			rootFieldSchema: {
				...stored.rootFieldSchema,
				persistedMetadata: { note: "changed" },
			},
		};
		assert.notEqual(
			schemaHasher(getSchemaHashInput(stored)),
			schemaHasher(getSchemaHashInput(changed)),
		);
		assert.equal(
			schemaHasher(getSchemaHashInput(stored)),
			schemaHasher(
				getSchemaHashInput({ ...stored, schemaVersion: versions, schemaHash: "ignored" }),
			),
		);
	});

	it("hashes the effective staged schema", () => {
		const root = factory.types([factory.number, factory.staged(factory.string)]);
		assert.equal(computeSchemaHash(root), computeSchemaHash(factory.number));
		assert.equal(
			computeSchemaHash(root, StagedSchemaUpgradePolicy.permissive),
			computeSchemaHash([factory.number, factory.string]),
		);
		assert.notEqual(
			computeSchemaHash(root),
			computeSchemaHash(root, StagedSchemaUpgradePolicy.permissive),
		);
	});

	for (const schemaVersion of [undefined, {}, versions]) {
		it(`requires a version increase for reversible metadata changes (${JSON.stringify(schemaVersion)})`, () => {
			const a = factory.required(factory.number, { persistedMetadata: { app: "A" } });
			const b = factory.required(factory.number, { persistedMetadata: { app: "B" } });
			const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
			const initial = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: a,
					schemaVersion,
					schemaHash: computeSchemaHash(a),
					schemaHasher,
				}),
			);
			initial.initialize(1);
			initial.dispose();
			const sameVersion = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: b,
					schemaVersion,
					schemaHash: computeSchemaHash(b),
					schemaHasher,
				}),
			);
			assert.equal(sameVersion.compatibility.canUpgrade, false);
			assert.equal(tree.storedSchemaHash, computeSchemaHash(a));
			sameVersion.dispose();
			const increasedVersion = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: b,
					schemaVersion: { [libraryId]: 2 },
					schemaHash: computeSchemaHash(b),
					schemaHasher,
				}),
			);
			assert.equal(increasedVersion.compatibility.canUpgrade, true);
			increasedVersion.upgradeSchema();
			assert.equal(tree.storedSchemaHash, computeSchemaHash(b));
			increasedVersion.dispose();
			const reversal = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: a,
					schemaVersion: { [libraryId]: 2 },
					schemaHash: computeSchemaHash(a),
					schemaHasher,
				}),
			);
			assert.equal(reversal.compatibility.canUpgrade, false);
			assert.throws(() => reversal.upgradeSchema(), /cannot be upgraded/);
			assert.equal(tree.storedSchemaHash, computeSchemaHash(b));
		});
	}

	it("allows metadata changes alongside a strictly additive schema upgrade", () => {
		const a = factory.required(factory.number, { persistedMetadata: { app: "A" } });
		const b = factory.required([factory.number, factory.string], {
			persistedMetadata: { app: "B" },
		});
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: a,
				schemaVersion: versions,
				schemaHash: computeSchemaHash(a),
				schemaHasher,
			}),
		);
		initial.initialize(1);
		initial.dispose();
		const next = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: b,
				schemaVersion: versions,
				schemaHash: computeSchemaHash(b),
				schemaHasher,
			}),
		);
		assert.equal(next.compatibility.canUpgrade, true);
		next.upgradeSchema();
		assert.equal(tree.storedSchemaHash, computeSchemaHash(b));
		assert.equal(next.root, 1);
	});

	it("allows hashing opt-in and version-only updates with equal canonical hashes", () => {
		const a = factory.required(factory.number, {
			persistedMetadata: { a: 1, b: 2 },
		});
		const b = factory.required(factory.number, {
			persistedMetadata: { b: 2, a: 1 },
		});
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initial = tree.viewWith(new TreeViewConfigurationAlpha({ schema: a }));
		initial.initialize(1);
		initial.dispose();
		for (const schemaVersion of [undefined, versions, { [libraryId]: 2 }]) {
			const next = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: b,
					schemaVersion,
					schemaHash: computeSchemaHash(b),
					schemaHasher,
				}),
			);
			assert.equal(next.compatibility.canUpgrade, true);
			next.upgradeSchema();
			assert.equal(tree.storedSchemaHash, computeSchemaHash(a));
			assert.deepEqual(tree.storedSchemaVersion, schemaVersion);
			next.dispose();
		}
	});

	it("initializes using the configured staged-upgrade flags", () => {
		const root = factory.types([factory.number, factory.staged(factory.string)]);
		const policy = StagedSchemaUpgradePolicy.permissive;
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const hash = computeSchemaHash(root, policy);
		const view = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: root,
				stagedUpgradePolicy: policy,
				schemaVersion: versions,
				schemaHash: hash,
				schemaHasher,
			}),
		);
		view.initialize("enabled");
		assert.equal(tree.storedSchemaHash, hash);
	});

	it("includes staged upgrades already enabled in the document when validating upgrades", () => {
		const root = factory.types([factory.number, factory.staged(factory.string)]);
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const hash = computeSchemaHash(root, StagedSchemaUpgradePolicy.permissive);
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: root,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.permissive,
				schemaVersion: versions,
				schemaHash: hash,
				schemaHasher,
			}),
		);
		initial.initialize("enabled");
		initial.dispose();
		const next = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: root,
				stagedUpgradePolicy: {
					...StagedSchemaUpgradePolicy.restrictive,
					includeAlreadyEnabledUpgrades: true,
				},
				schemaVersion: { [libraryId]: 2 },
				schemaHash: hash,
				schemaHasher,
			}),
		);
		next.upgradeSchema();
		assert.equal(tree.storedSchemaHash, hash);
		assert.equal(next.root, "enabled");
	});

	for (const schemaVersion of [versions, {}]) {
		for (const props of [
			{},
			{ schemaHash: computeSchemaHash(factory.number) },
			{ schemaHasher },
			{ schemaHash: "stale", schemaHasher },
		]) {
			it(`rejects invalid versioned initialization ${JSON.stringify(schemaVersion)} ${Object.keys(props)}`, () => {
				const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
				const view = asTreeViewAlpha(
					tree.viewWith(
						new TreeViewConfigurationAlpha({
							schema: factory.number,
							schemaVersion,
							...props,
						}),
					),
				);
				let changes = 0;
				view.events.on("changed", () => changes++);
				assert.throws(
					() => view.initialize(1),
					/schemaHash and schemaHasher|Schema hash does not match/,
				);
				assert.equal(changes, 0);
				assert.equal(tree.storedSchemaHash, undefined);
				assert.equal(tree.storedSchemaVersion, undefined);
			});
		}
	}

	it("rejects stale hashes before an upgrade changes the schema", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initialHash = computeSchemaHash(factory.number);
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaVersion: versions,
				schemaHash: initialHash,
				schemaHasher,
			}),
		);
		initial.initialize(1);
		initial.dispose();
		const view = asTreeViewAlpha(
			tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: [factory.number, factory.string],
					schemaVersion: { [libraryId]: 2 },
					schemaHash: initialHash,
					schemaHasher,
				}),
			),
		);
		let changes = 0;
		view.events.on("changed", () => changes++);
		assert.throws(() => view.upgradeSchema(), /Schema hash does not match/);
		assert.equal(changes, 0);
		assert.equal(tree.storedSchemaHash, initialHash);
		assert.deepEqual(tree.storedSchemaVersion, versions);
	});

	it("persists a valid hash and exposes it on views, trees and snapshots", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const hash = computeSchemaHash(factory.number);
		const config = new TreeViewConfigurationAlpha({
			schema: factory.number,
			schemaVersion: versions,
			schemaHash: hash,
			schemaHasher,
		});
		const view = asTreeViewAlpha(tree.viewWith(config));
		assert.equal(view.schemaHash, hash);
		assert.equal(view.storedSchemaHash, undefined);
		view.initialize(1);
		assert.equal(view.storedSchemaHash, hash);
		assert.equal(tree.storedSchemaHash, hash);
		assert.equal(tree.exportSimpleSchema().schemaHash, hash);
		const imported = importCompatibilitySchemaSnapshot(
			exportCompatibilitySchemaSnapshot(config),
		);
		assert.equal(imported.schemaHash, hash);
		assert.equal(imported.schemaHasher, undefined);
		const repository = new TreeStoredSchemaRepository(
			toInitialSchema(factory.number, undefined, versions, hash),
		);
		assert.equal(repository.clone().schemaHash, hash);
		repository.apply(toInitialSchema(factory.string, undefined, versions, "replacement"));
		assert.equal(repository.schemaHash, "replacement");
	});

	for (const schemaVersion of [versions, undefined]) {
		it(`propagates initialized and upgraded hashes to collaborating clients (${schemaVersion === undefined ? "unversioned" : "versioned"})`, () => {
			const provider = new TestTreeProviderLite(
				2,
				new SharedTreeTestFactory(() => {}, undefined, {
					allowPossiblyIncompatibleWriteVersionOverrides: true,
					writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
				}),
			);
			const [local, remote] = provider.trees;
			const initialHash = computeSchemaHash(factory.number);
			const initial = local.viewWith(
				new TreeViewConfigurationAlpha({
					schema: factory.number,
					schemaHash: initialHash,
					schemaHasher,
					schemaVersion,
				}),
			);
			initial.initialize(1);
			provider.synchronizeMessages();
			assert.equal(remote.storedSchemaHash, initialHash);
			initial.dispose();
			const root = [factory.number, factory.string];
			const upgradedHash = computeSchemaHash(root);
			const upgraded = local.viewWith(
				new TreeViewConfigurationAlpha({
					schema: root,
					schemaHash: upgradedHash,
					schemaHasher,
					schemaVersion: schemaVersion === undefined ? undefined : { [libraryId]: 2 },
				}),
			);
			upgraded.upgradeSchema();
			provider.synchronizeMessages();
			assert.equal(local.storedSchemaHash, upgradedHash);
			assert.equal(remote.storedSchemaHash, upgradedHash);
			assert.deepEqual(
				remote.storedSchemaVersion,
				schemaVersion === undefined ? undefined : { [libraryId]: 2 },
			);
		});

		it(`restores hashes when loading a summary (${schemaVersion === undefined ? "unversioned" : "versioned"})`, async () => {
			const provider = await TestTreeProvider.create(
				1,
				SummarizeType.onDemand,
				new SharedTreeTestFactory(() => {}, undefined, {
					allowPossiblyIncompatibleWriteVersionOverrides: true,
					writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
				}),
			);
			const hash = computeSchemaHash(factory.number);
			const config = new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaHash: hash,
				schemaHasher,
				schemaVersion,
			});
			provider.trees[0].viewWith(config).initialize(1);
			await provider.ensureSynchronized();
			await provider.summarize();
			await provider.ensureSynchronized();
			const loaded = await provider.createTree();
			assert.equal(loaded.storedSchemaHash, hash);
			assert.deepEqual(loaded.storedSchemaVersion, schemaVersion);
			const view = asTreeViewAlpha(loaded.viewWith(config));
			assert.equal(view.storedSchemaHash, hash);
			assert.equal(view.compatibility.isEquivalent, true);
			assert.equal(view.root, 1);
		});
	}

	it("requires valid hashes even for an equivalent schema upgrade", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const hash = computeSchemaHash(factory.number);
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaVersion: versions,
				schemaHash: hash,
				schemaHasher,
			}),
		);
		initial.initialize(1);
		initial.dispose();
		const next = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaVersion: versions,
			}),
		);
		assert.throws(() => next.upgradeSchema(), /schemaHash and schemaHasher/);
		assert.equal(tree.storedSchemaHash, hash);
	});

	it("initializes and upgrades an unversioned schema with hashing", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const hash = computeSchemaHash(factory.number);
		const initial = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaHash: hash,
				schemaHasher,
			}),
		);
		initial.initialize(1);
		assert.equal(tree.storedSchemaHash, hash);
		assert.equal(tree.storedSchemaVersion, undefined);
		initial.dispose();

		const root = [factory.number, factory.string];
		const upgradedHash = computeSchemaHash(root);
		const config = new TreeViewConfigurationAlpha({
			schema: root,
			schemaHash: upgradedHash,
			schemaHasher,
		});
		const next = tree.viewWith(config);
		assert.equal(next.compatibility.canUpgrade, true);
		next.upgradeSchema();
		assert.equal(tree.storedSchemaHash, upgradedHash);
		assert.equal(tree.storedSchemaVersion, undefined);
		const imported = importCompatibilitySchemaSnapshot(
			exportCompatibilitySchemaSnapshot(config),
		);
		assert.equal(imported.schemaHash, upgradedHash);
		assert.equal(imported.schemaVersion, undefined);
		const converted = toInitialSchema(root, undefined, undefined, upgradedHash);
		assert.equal(converted.schemaHash, upgradedHash);
		assert.equal(converted.schemaVersion, undefined);
	});

	it("allows an unversioned schema to opt into hashing during an upgrade", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initial = tree.viewWith(new TreeViewConfigurationAlpha({ schema: factory.number }));
		initial.initialize(1);
		initial.dispose();
		const hash = computeSchemaHash(factory.number);
		const next = tree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: factory.number,
				schemaHash: hash,
				schemaHasher,
			}),
		);
		assert.equal(next.compatibility.canUpgrade, true);
		assert.equal(next.compatibility.isEquivalent, false);
		next.upgradeSchema();
		assert.equal(tree.storedSchemaHash, hash);
		assert.equal(tree.storedSchemaVersion, undefined);
	});

	for (const props of [
		{},
		{ schemaHash: computeSchemaHash(factory.number) },
		{ schemaHasher },
		{ schemaHash: "stale", schemaHasher },
	]) {
		it(`rejects invalid unversioned hashed upgrades ${Object.keys(props)}`, () => {
			const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
			const hash = computeSchemaHash(factory.number);
			const initial = tree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: factory.number,
					schemaHash: hash,
					schemaHasher,
				}),
			);
			initial.initialize(1);
			initial.dispose();
			const next = asTreeViewAlpha(
				tree.viewWith(new TreeViewConfigurationAlpha({ schema: factory.number, ...props })),
			);
			assert.equal(next.compatibility.canUpgrade, props.schemaHash === hash);
			let changes = 0;
			next.events.on("changed", () => changes++);
			assert.throws(
				() => next.upgradeSchema(),
				/schemaHash and schemaHasher|Schema hash does not match/,
			);
			assert.equal(changes, 0);
			assert.equal(tree.storedSchemaHash, hash);
		});
	}

	for (const props of [
		{ schemaHash: computeSchemaHash(factory.number) },
		{ schemaHasher },
		{ schemaHash: "stale", schemaHasher },
	]) {
		it(`rejects invalid unversioned hashed initialization ${Object.keys(props)}`, () => {
			const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
			const view = tree.viewWith(
				new TreeViewConfigurationAlpha({ schema: factory.number, ...props }),
			);
			assert.throws(
				() => view.initialize(1),
				/schemaHash and schemaHasher|Schema hash does not match/,
			);
			assert.equal(tree.storedSchemaHash, undefined);
		});
	}

	it("does not invoke hashing for unversioned initialization or upgrades", () => {
		const tree = createIndependentTreeAlpha({ idCompressor: testIdCompressor });
		const initial = tree.viewWith(new TreeViewConfigurationAlpha({ schema: factory.number }));
		initial.initialize(1);
		initial.dispose();
		const view = tree.viewWith(
			new TreeViewConfigurationAlpha({ schema: [factory.number, factory.string] }),
		);
		view.upgradeSchema();
		assert.equal(tree.storedSchemaHash, undefined);
	});
});
