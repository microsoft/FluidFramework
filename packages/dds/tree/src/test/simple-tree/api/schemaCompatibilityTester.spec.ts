/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	storedEmptyFieldSchema,
	type TreeFieldStoredSchema,
	type TreeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	TreeStoredSchemaRepository,
	ValueSchema,
} from "../../../core/index.js";
import {
	allowsRepoSuperset,
	defaultSchemaPolicy,
	FieldKinds,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { LeafNodeSchema } from "../../../simple-tree/leafNodeSchema.js";
import {
	checkGeneratedSchemaCompatibility,
	checkSchemaCompatibility,
	getSchemaUpgradeCandidate,
	isSchemaUpgradeAllowed,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	type SchemaDiscrepancy,
	type CompatibilityResult,
	type SchemaViewIncompatibility,
	type SchemaUpgradeIncompatibility,
	type SchemaUpgrade,
	type StagedUpgradeStatus,
	type ValidateRecursiveSchema,
	schemaStatics,
	StagedSchemaUpgradePolicy,
	TreeViewConfigurationAlpha,
	toInitialSchema,
	toUpgradeSchema,
	allowUnused,
} from "../../../simple-tree/index.js";
import { SchemaFactoryAlpha } from "../../../simple-tree/index.js";
import { testSchema } from "../../testTrees.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";
import { expectSchemaEqual, TestSchemaRepository } from "../../utils.js";

const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: storedEmptyFieldSchema,
};

const factory = new SchemaFactoryAlpha("");

/**
 * Checks structured details without tying every scenario to the reason's exact wording.
 * Tests for reason formatting compare the full message separately.
 */
function assertIncompatibilities(
	actual: readonly (SchemaDiscrepancy | SchemaUpgradeIncompatibility)[] | undefined,
	expected: readonly object[],
): void {
	assert(actual !== undefined);
	assert.deepEqual(
		actual.map((entry) => {
			assert("reason" in entry);
			assert.equal(typeof entry.reason, "string");
			assert(entry.reason.length > 0);
			const { reason, ...details } = entry;
			return details;
		}),
		expected,
	);
}

/**
 * Checks that the old and new compatibility APIs agree for the supplied schemas.
 * For an allowed upgrade, also checks that the candidate preserves stored content and supports the view.
 */
function expectCompatibility(
	{ view, stored }: { view: ImplicitFieldSchema; stored: TreeStoredSchema },
	expected: Pick<ReturnType<typeof checkSchemaCompatibility>, "canView" | "canUpgrade"> & {
		enabledUpgrades?: ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus>;
	},
	stagedUpgradePolicy?: StagedSchemaUpgradePolicy,
) {
	const viewSchema = new TreeViewConfigurationAlpha({ schema: view, stagedUpgradePolicy });
	const compatibility = checkSchemaCompatibility(
		viewSchema,
		stored,
		viewSchema.stagedUpgradePolicy,
	);
	const { discrepancies, canView, canUpgrade, enabledUpgrades } = compatibility;
	// Check the existing properties alongside the new results.
	assert.deepEqual(
		{
			canView,
			canUpgrade,
			enabledUpgrades,
		},
		{
			enabledUpgrades: new Map(),
			...expected,
		},
	);
	assert.equal(discrepancies === undefined, compatibility.canView);
	assert.equal(compatibility.view.isCompatible, canView);
	assert.equal(compatibility.upgrade.isCompatible, canUpgrade);
	if (compatibility.view.isCompatible) {
		assert.deepEqual(compatibility.view, { isCompatible: true });
	} else {
		assert.strictEqual(compatibility.view.incompatibilities, discrepancies);
		assert(compatibility.view.incompatibilities.length > 0);
	}
	if (compatibility.upgrade.isCompatible) {
		assert.deepEqual(compatibility.upgrade, { isCompatible: true });
	} else if (!canView) {
		assert(compatibility.upgrade.incompatibilities.length > 0);
	}
	// Leave deferred details unread when viewing succeeds, so this helper does not force their calculation.

	const candidate = getSchemaUpgradeCandidate(
		viewSchema,
		stored,
		viewSchema.stagedUpgradePolicy,
	);

	// A permitted upgrade preserves existing content and produces a stored schema that the view can read and edit.
	if (compatibility.canUpgrade) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, candidate), true);
		assert.equal(checkSchemaCompatibility(viewSchema, candidate).view.isCompatible, true);
	}

	return compatibility;
}

describe("checkSchemaCompatibility viewing incompatibilities", () => {
	it("formats an allowed types discrepancy", () => {
		const schema = new TreeViewConfigurationAlpha({ schema: factory.string });
		const { view } = checkSchemaCompatibility(schema, toUpgradeSchema(factory.number));
		assert(!view.isCompatible);
		assertIncompatibilities(view.incompatibilities, [
			{
				mismatch: "allowedTypes",
				location: "root",
				view: [factory.string.identifier],
				stored: [factory.number.identifier],
			},
		]);
		assert.equal(
			view.incompatibilities[0]?.reason,
			'Cannot view the root field: the view allows node types ["com.fluidframework.leaf.string"] that the stored schema does not allow; the stored schema allows node types ["com.fluidframework.leaf.number"] that the view does not allow.',
		);
	});

	it("formats all discrepancies", () => {
		const schema = new TreeViewConfigurationAlpha({
			schema: factory.optional(factory.string),
		});
		const { view } = checkSchemaCompatibility(
			schema,
			toUpgradeSchema(factory.required(factory.number)),
		);
		assert(!view.isCompatible);
		assertIncompatibilities(view.incompatibilities, [
			{
				mismatch: "allowedTypes",
				location: "root",
				view: [factory.string.identifier],
				stored: [factory.number.identifier],
			},
			{
				mismatch: "fieldKind",
				location: "root",
				view: "Optional",
				stored: "Value",
			},
		]);
		assert.equal(
			view.incompatibilities[1]?.reason,
			"Cannot view the root field: the view permits zero or one child, but the stored schema permits exactly one child.",
		);
	});

	it("formats a value schema discrepancy", () => {
		// Reuse the identifier to test a changed leaf definition, not a change to the field's allowed types.
		const identifier = "valueSchema";
		const viewLeaf = new LeafNodeSchema(identifier, ValueSchema.Number);
		const storedLeaf = new LeafNodeSchema(identifier, ValueSchema.String);
		const schema = new TreeViewConfigurationAlpha({ schema: viewLeaf });
		const { view } = checkSchemaCompatibility(schema, toUpgradeSchema(storedLeaf));
		assert(!view.isCompatible);
		assertIncompatibilities(view.incompatibilities, [
			{
				mismatch: "valueSchema",
				nodeType: identifier,
				view: "Number",
				stored: "String",
			},
		]);
		assert.equal(
			view.incompatibilities[0]?.reason,
			'Cannot view node type "valueSchema": the view expects number values, but the stored schema allows string values.',
		);
	});

	it("formats a node kind discrepancy", () => {
		class ViewNode extends factory.object("nodeKind", {}) {}
		class StoredNode extends factory.map("nodeKind", []) {}
		const schema = new TreeViewConfigurationAlpha({ schema: ViewNode });
		const { view } = checkSchemaCompatibility(schema, toUpgradeSchema(StoredNode));
		assert(!view.isCompatible);
		assertIncompatibilities(view.incompatibilities, [
			{
				mismatch: "nodeKind",
				nodeType: ViewNode.identifier,
				view: "Object",
				stored: "Map",
			},
		]);
		assert.equal(
			view.incompatibilities[0]?.reason,
			'Cannot view node type ".nodeKind": the stored node structure does not match the view\'s Object definition (stored representation: Map).',
		);
	});

	it("formats staged allowed type context", () => {
		// Null blocks viewing. The staged string type supplies rollout context but is not itself a blocker.
		class ViewNode extends factory.objectAlpha("stagedAllowedTypeDetails", {
			foo: factory.types([factory.number, factory.staged(factory.string)]),
		}) {}
		class StoredNode extends factory.objectAlpha("stagedAllowedTypeDetails", {
			foo: [factory.number, factory.null],
		}) {}
		const schema = new TreeViewConfigurationAlpha({ schema: ViewNode });

		const { view } = checkSchemaCompatibility(schema, toUpgradeSchema(StoredNode));
		assert(!view.isCompatible);
		assertIncompatibilities(view.incompatibilities, [
			{
				mismatch: "allowedTypes",
				location: {
					nodeType: ViewNode.identifier,
					fieldKey: "foo",
				},
				view: [],
				stagedView: [factory.string.identifier],
				stored: [factory.null.identifier],
			},
		]);
		assert.equal(
			view.incompatibilities[0]?.reason,
			'Cannot view field "foo" of node type ".stagedAllowedTypeDetails": the stored schema allows node types ["com.fluidframework.leaf.null"] that the view does not allow.',
		);
	});

	it("formats staged optional field context", () => {
		class ViewNode extends factory.objectAlpha("stagedOptionalDetails", {
			foo: factory.stagedOptional(factory.number),
		}) {}
		class StoredNode extends factory.objectAlpha("stagedOptionalDetails", {}) {}
		const schema = new TreeViewConfigurationAlpha({ schema: ViewNode });

		const { view } = checkSchemaCompatibility(schema, toUpgradeSchema(StoredNode));
		assert(!view.isCompatible);
		assertIncompatibilities(view.incompatibilities, [
			{
				mismatch: "fieldKind",
				location: {
					nodeType: ViewNode.identifier,
					fieldKey: "foo",
				},
				view: "Optional",
				stored: "Forbidden",
				viewIsStagedOptional: true,
			},
		]);
	});
});

describe("isSchemaUpgradeAllowed", () => {
	it("allows adding an optional field even when the current document cannot be viewed", () => {
		class Before extends factory.object("Task", {
			title: factory.string,
		}) {}

		// Add optional notes; the document needs this field's schema before the view can write notes.
		class After extends factory.object("Task", {
			title: factory.string,
			notes: factory.optional(factory.string),
		}) {}
		const view = new TreeViewConfigurationAlpha({ schema: After });
		const stored = toUpgradeSchema(Before);
		const candidate = toUpgradeSchema(After);

		// Viewing is blocked before the upgrade, but the candidate adds the missing optional field without removing anything.
		assert.equal(checkSchemaCompatibility(view, stored).view.isCompatible, false);
		assert.equal(isSchemaUpgradeAllowed(view, stored, candidate), true);
	});

	it("rejects a candidate that discards allowed content even when the view can use it", () => {
		class Before extends factory.object("Task", {
			priority: factory.number,
		}) {}

		// Replace numeric priorities with strings without providing support for the historical numeric values.
		class After extends factory.object("Task", {
			priority: factory.string,
		}) {}
		const view = new TreeViewConfigurationAlpha({ schema: After });
		const stored = toUpgradeSchema(Before);
		const candidate = toUpgradeSchema(After);

		// A view-only target suits the new application but cannot safely replace the historical schema.
		assert.equal(checkSchemaCompatibility(view, candidate).view.isCompatible, true);
		assert.equal(isSchemaUpgradeAllowed(view, stored, candidate), false);
	});

	// Adding notes must preserve existing priority types, but this view has dropped support for strings.
	describe("when the candidate preserves types the view cannot read", () => {
		class Before extends factory.object("Task", {
			priority: [factory.number, factory.string],
		}) {}

		class After extends factory.object("Task", {
			priority: factory.number,
			notes: factory.optional(factory.string),
		}) {}
		const view = new TreeViewConfigurationAlpha({ schema: After });
		const stored = toUpgradeSchema(Before);
		const candidate = getSchemaUpgradeCandidate(
			view,
			stored,
			StagedSchemaUpgradePolicy.restrictive,
		);

		it("rejects the upgrade even though it preserves all stored content", () => {
			// Preserving stored content is necessary, but it does not prove that the view can use the candidate.
			assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, candidate), true);
			assert.equal(isSchemaUpgradeAllowed(view, stored, candidate), false);
		});

		it("explains which preserved types the view cannot read", () => {
			const { upgrade } = checkSchemaCompatibility(view, stored);
			assert(!upgrade.isCompatible);
			// Report the rejected candidate's string support; no upgrade has been applied.
			const expectedViewingIncompatibility = {
				mismatch: "allowedTypes",
				location: { nodeType: After.identifier, fieldKey: "priority" },
				view: [],
				stored: [factory.string.identifier],
				reason:
					'Cannot view field "priority" of node type ".Task": the stored schema allows node types ["com.fluidframework.leaf.string"] that the view does not allow.',
			};
			assert.deepEqual(upgrade.incompatibilities, [
				{
					mismatch: "viewIncompatibleAfterUpgrade",
					reason:
						"Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.",
					incompatibilities: [expectedViewingIncompatibility],
				},
			]);
		});
	});
});

describe("checkSchemaCompatibility", () => {
	it("narrows incompatibilities using isCompatible", () => {
		const checkResult = (result: CompatibilityResult<SchemaViewIncompatibility>): void => {
			if (result.isCompatible) {
				allowUnused<
					requireTrue<areSafelyAssignable<typeof result, { readonly isCompatible: true }>>
				>();
			} else {
				allowUnused<
					requireTrue<
						areSafelyAssignable<
							typeof result.incompatibilities,
							readonly SchemaViewIncompatibility[]
						>
					>
				>();
			}
		};
		checkResult({ isCompatible: true });
	});

	// The view can ignore legacyPriority, but an upgrade cannot remove a definition needed by detached content.
	// This gives us a usable view with a blocked upgrade whose failure details can be deferred.
	describe("deferred upgrade incompatibilities", () => {
		class Stored extends factory.object("diagnostics.Deferred", {
			priority: factory.number,
			legacyPriority: factory.optional(factory.number),
		}) {}
		class View extends factory.object(
			"diagnostics.Deferred",
			{ priority: factory.number },
			{ allowUnknownOptionalFields: true },
		) {}
		const config = new TreeViewConfigurationAlpha({ schema: View });

		it("collects details only on first access and reuses them on later accesses", () => {
			const stored = toUpgradeSchema(Stored);
			const nodeSchema = new Map([
				...stored.nodeSchema,
				...toUpgradeSchema(factory.string).nodeSchema,
			]);
			let rootTypeReads = 0;
			// Count schema reads to detect another comparison without depending on an exact traversal count.
			const rootFieldSchema = {
				kind: stored.rootFieldSchema.kind,
				persistedMetadata: stored.rootFieldSchema.persistedMetadata,
				get types() {
					rootTypeReads++;
					return stored.rootFieldSchema.types;
				},
			};
			const compatibility = checkSchemaCompatibility(config, {
				rootFieldSchema,
				nodeSchema,
			});
			assert.equal(compatibility.view.isCompatible, true);
			assert(!compatibility.upgrade.isCompatible);
			// Reading the permission must not start another schema comparison.
			const readsAfterCheck = rootTypeReads;
			assert.equal(compatibility.upgrade.isCompatible, false);
			assert.equal(rootTypeReads, readsAfterCheck);

			// The first details access starts comparison; later accesses reuse its result.
			const details = compatibility.upgrade.incompatibilities;
			assert(rootTypeReads > readsAfterCheck);
			assert(details.length > 0);

			const readsAfterDetails = rootTypeReads;
			assert.strictEqual(compatibility.upgrade.incompatibilities, details);
			assert.equal(rootTypeReads, readsAfterDetails);
		});

		it("retains the original stored schema for deferred upgrade incompatibilities", () => {
			const initial = toUpgradeSchema(Stored);
			const stored = new TreeStoredSchemaRepository({
				rootFieldSchema: initial.rootFieldSchema,
				nodeSchema: new Map([
					...initial.nodeSchema,
					...toUpgradeSchema(factory.string).nodeSchema,
				]),
			});
			const originalResult = checkSchemaCompatibility(config, stored);
			assert(!originalResult.upgrade.isCompatible);

			// Replace the schema directly to simulate a later document state, not a permitted upgrade.
			stored.apply(toUpgradeSchema(View));
			const currentResult = checkSchemaCompatibility(config, stored);
			assert.equal(currentResult.upgrade.isCompatible, true);
			// First read the old details after the change: they must still describe the missing detached-content definition.
			assertIncompatibilities(originalResult.upgrade.incompatibilities, [
				{
					mismatch: "missingNodeSchema",
					nodeType: factory.string.identifier,
				},
			]);
		});
	});

	describe("diagnostics", () => {
		it("omits diagnostics when viewing and upgrading are both allowed", () => {
			const compatibility = expectCompatibility(
				{ view: factory.number, stored: toUpgradeSchema(factory.number) },
				{ canView: true, canUpgrade: true },
			);
			assert.equal(compatibility.discrepancies, undefined);
			assert.deepEqual(compatibility.upgrade, { isCompatible: true });
		});

		it("preserves viewing details but omits upgrade details when upgrading is sufficient", () => {
			const compatibility = expectCompatibility(
				{
					view: [factory.number, factory.string],
					stored: toUpgradeSchema(factory.number),
				},
				{ canView: false, canUpgrade: true },
			);
			assertIncompatibilities(compatibility.discrepancies, [
				{
					mismatch: "allowedTypes",
					location: "root",
					view: [factory.string.identifier],
					stored: [],
				},
			]);
			assert.deepEqual(compatibility.upgrade, { isCompatible: true });
		});

		it("does not mistake an allowed object-to-map upgrade for an upgrade blocker", () => {
			// The map can represent the object's existing field, even though it cannot view the old object representation.
			class Stored extends factory.object("diagnostics.ObjectToMap", {
				x: factory.number,
			}) {}
			class View extends factory.map("diagnostics.ObjectToMap", factory.number) {}

			const compatibility = expectCompatibility(
				{ view: View, stored: toUpgradeSchema(Stored) },
				{ canView: false, canUpgrade: true },
			);
			assertIncompatibilities(compatibility.discrepancies, [
				{
					mismatch: "nodeKind",
					nodeType: View.identifier,
					view: "Map",
					stored: "Object",
				},
			]);
			assert.deepEqual(compatibility.upgrade, { isCompatible: true });
		});

		it("permits viewing and upgrading an already-enabled staged type", () => {
			const stagedString = factory.staged(factory.string);
			const upgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(upgrade !== undefined);
			const compatibility = expectCompatibility(
				{
					view: factory.types([factory.number, stagedString]),
					stored: toUpgradeSchema([factory.number, factory.string]),
				},
				{
					canView: true,
					canUpgrade: true,
					enabledUpgrades: new Map([[upgrade, "enabled"]]),
				},
			);
			assert.equal(compatibility.discrepancies, undefined);
		});

		it("keeps the short-circuiting stored-schema comparison for a root failure", () => {
			// Rejecting a root type removal should not require visiting any node definitions.
			class CountingSchemaMap extends Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> {
				public iterations = 0;
				public override [Symbol.iterator](): MapIterator<
					[TreeNodeSchemaIdentifier, TreeNodeStoredSchema]
				> {
					this.iterations++;
					return super[Symbol.iterator]();
				}
			}
			const schema = toUpgradeSchema([factory.number, factory.string]);
			const nodeSchema = new CountingSchemaMap(schema.nodeSchema);
			assert.equal(
				allowsRepoSuperset(
					defaultSchemaPolicy,
					{ rootFieldSchema: schema.rootFieldSchema, nodeSchema },
					toUpgradeSchema(factory.number),
				),
				false,
			);
			assert.equal(nodeSchema.iterations, 0);
		});

		it("explains preserved root types that still prevent viewing after an upgrade", () => {
			const compatibility = expectCompatibility(
				{
					view: factory.number,
					stored: toUpgradeSchema([factory.number, factory.string]),
				},
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.view.isCompatible);
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.discrepancies, [
				{
					mismatch: "allowedTypes",
					location: "root",
					view: [],
					stored: [factory.string.identifier],
				},
			]);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "viewIncompatibleAfterUpgrade",
					incompatibilities: compatibility.view.incompatibilities,
				},
			]);
			assert.deepEqual(
				compatibility.upgrade.incompatibilities.map(({ reason }) => reason),
				[
					"Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.",
				],
			);
		});

		it("distinguishes a viewing field blocker from a missing-definition upgrade blocker", () => {
			// The missing added field blocks writes; removing a detached-content definition blocks the upgrade.
			class Stored extends factory.object("diagnostics.DifferentBlockers", {
				x: factory.number,
				hidden: factory.optional(factory.number),
			}) {}
			class View extends factory.object(
				"diagnostics.DifferentBlockers",
				{
					x: factory.number,
					added: factory.optional(factory.number),
				},
				{ allowUnknownOptionalFields: true },
			) {}
			const initial = toUpgradeSchema(Stored);
			const stored = {
				rootFieldSchema: initial.rootFieldSchema,
				nodeSchema: new Map([
					...initial.nodeSchema,
					...toUpgradeSchema(factory.string).nodeSchema,
				]),
			};
			const compatibility = expectCompatibility(
				{ view: View, stored },
				{ canView: false, canUpgrade: false },
			);
			assertIncompatibilities(compatibility.discrepancies, [
				{
					mismatch: "fieldKind",
					location: { nodeType: View.identifier, fieldKey: "added" },
					view: "Optional",
					stored: "Forbidden",
				},
			]);
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "missingNodeSchema",
					nodeType: factory.string.identifier,
				},
			]);
		});

		it("reports a prohibited field transition without reporting preserved types or legal relaxations", () => {
			// Mix blocked and permitted changes to ensure the upgrade report contains only the prohibited transition.
			class Stored extends factory.object("diagnostics.AllBlockers", {
				types: [factory.number, factory.string],
				narrowed: factory.optional(factory.number),
				relaxed: factory.number,
				text: factory.string,
			}) {}
			class View extends factory.object("diagnostics.AllBlockers", {
				types: factory.number,
				narrowed: factory.number,
				relaxed: factory.optional(factory.number),
				text: factory.string,
			}) {}
			const compatibility = expectCompatibility(
				{ view: View, stored: toUpgradeSchema([Stored, factory.string]) },
				{ canView: false, canUpgrade: false },
			);
			assertIncompatibilities(compatibility.discrepancies, [
				{
					mismatch: "allowedTypes",
					location: "root",
					view: [],
					stored: [factory.string.identifier],
				},
				{
					mismatch: "allowedTypes",
					location: { nodeType: View.identifier, fieldKey: "types" },
					view: [],
					stored: [factory.string.identifier],
				},
				{
					mismatch: "fieldKind",
					location: { nodeType: View.identifier, fieldKey: "narrowed" },
					view: "Value",
					stored: "Optional",
				},
				{
					mismatch: "fieldKind",
					location: { nodeType: View.identifier, fieldKey: "relaxed" },
					view: "Optional",
					stored: "Value",
				},
			]);
			// Composition retains the stored types; making relaxed optional is legal. Only making narrowed required must fail.
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "fieldKind",
					location: { nodeType: View.identifier, fieldKey: "narrowed" },
					proposed: "Value",
					stored: "Optional",
				},
			]);
		});

		it("locates preserved types that the view cannot read in an array's sequence field", () => {
			class StoredItems extends factory.array("diagnostics.Items", [
				factory.number,
				factory.string,
			]) {}
			class ViewItems extends factory.array("diagnostics.Items", factory.number) {}
			// Keep string reachable through text so the failure concerns array elements, not a missing node definition.
			class Stored extends factory.object("diagnostics.ArrayRoot", {
				items: StoredItems,
				text: factory.string,
			}) {}
			class View extends factory.object("diagnostics.ArrayRoot", {
				items: ViewItems,
				text: factory.string,
			}) {}
			const compatibility = expectCompatibility(
				{ view: View, stored: toUpgradeSchema(Stored) },
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.upgrade.isCompatible);
			// Array elements use the empty stored field key.
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "viewIncompatibleAfterUpgrade",
					incompatibilities: [
						{
							mismatch: "allowedTypes",
							location: { nodeType: ViewItems.identifier, fieldKey: EmptyKey },
							view: [],
							stored: [factory.string.identifier],
							reason:
								'Cannot view field "" of node type ".diagnostics.Items": the stored schema allows node types ["com.fluidframework.leaf.string"] that the view does not allow.',
						},
					],
				},
			]);
		});

		it("locates preserved types that the view cannot read in a map's implicit field", () => {
			class StoredItems extends factory.map("diagnostics.Map", [
				factory.number,
				factory.string,
			]) {}
			class ViewItems extends factory.map("diagnostics.Map", factory.number) {}
			// Keep string reachable through text so only the map's allowed entry types prevent viewing.
			class Stored extends factory.object("diagnostics.MapRoot", {
				items: StoredItems,
				text: factory.string,
			}) {}
			class View extends factory.object("diagnostics.MapRoot", {
				items: ViewItems,
				text: factory.string,
			}) {}
			const compatibility = expectCompatibility(
				{ view: View, stored: toUpgradeSchema(Stored) },
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.upgrade.isCompatible);
			// A map shares one schema across all keys, so its diagnostic has no individual field key.
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "viewIncompatibleAfterUpgrade",
					incompatibilities: [
						{
							mismatch: "allowedTypes",
							location: { nodeType: ViewItems.identifier, fieldKey: undefined },
							view: [],
							stored: [factory.string.identifier],
							reason: `Cannot view map entries of node type ${JSON.stringify(ViewItems.identifier)}: the stored schema allows node types ["com.fluidframework.leaf.string"] that the view does not allow.`,
						},
					],
				},
			]);
			assert.equal(
				compatibility.upgrade.incompatibilities[0]?.reason,
				"Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.",
			);
		});

		it("explains a field-kind transition forbidden by monotonic upgrade policy", () => {
			const compatibility = expectCompatibility(
				{ view: factory.identifier, stored: toUpgradeSchema(factory.string) },
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "fieldKind",
					location: "root",
					proposed: "Identifier",
					stored: "Value",
				},
			]);
			assert.equal(
				compatibility.upgrade.incompatibilities[0]?.reason,
				"Cannot upgrade the root field: changing from exactly one child to exactly one identifier string is not permitted by the schema upgrade rules.",
			);
		});

		it("explains incompatible leaf value schemas under the same identifier", () => {
			const identifier = "diagnostics.Leaf";
			const view = new LeafNodeSchema(identifier, ValueSchema.Number);
			const stored = toUpgradeSchema(new LeafNodeSchema(identifier, ValueSchema.String));
			const compatibility = expectCompatibility(
				{ view, stored },
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "valueSchema",
					nodeType: identifier,
					proposed: "Number",
					stored: "String",
				},
			]);
			assert.equal(
				compatibility.upgrade.incompatibilities[0]?.reason,
				'Cannot upgrade node type "diagnostics.Leaf": changing leaf values from string values to number values is not permitted.',
			);
		});

		it("explains incompatible stored node kinds", () => {
			class Stored extends factory.map("diagnostics.NodeKind", factory.number) {}
			class View extends factory.object("diagnostics.NodeKind", {
				x: factory.optional(factory.number),
			}) {}
			const compatibility = expectCompatibility(
				{ view: View, stored: toUpgradeSchema(Stored) },
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "nodeKind",
					nodeType: View.identifier,
					proposed: "Object",
					stored: "Map",
				},
			]);
			assert.equal(
				compatibility.upgrade.incompatibilities[0]?.reason,
				`Cannot upgrade node type ${JSON.stringify(View.identifier)}: changing the stored node representation from Map to Object is not permitted.`,
			);
		});

		it("reports missing stored node definitions even when unreachable from the root", () => {
			const base = toUpgradeSchema(factory.number);
			// Detached content can still use string nodes, even though the root cannot reach their definition.
			const stored: TreeStoredSchema = {
				rootFieldSchema: base.rootFieldSchema,
				nodeSchema: new Map([
					...base.nodeSchema,
					...toUpgradeSchema(factory.string).nodeSchema,
				]),
			};
			const compatibility = expectCompatibility(
				{ view: factory.optional(factory.number), stored },
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "missingNodeSchema",
					nodeType: factory.string.identifier,
				},
			]);
		});

		it("does not report missing uninhabitable node definitions as upgrade blockers", () => {
			// A required self-reference has no finite tree, so this definition cannot describe detached content.
			class Never extends factory.objectRecursive("diagnostics.Never", {
				child: factory.requiredRecursive([() => Never]),
			}) {}
			const base = toUpgradeSchema(factory.optional(factory.number));
			const stored: TreeStoredSchema = {
				rootFieldSchema: base.rootFieldSchema,
				nodeSchema: new Map([...base.nodeSchema, ...toUpgradeSchema(Never).nodeSchema]),
			};
			const compatibility = expectCompatibility(
				{ view: factory.number, stored },
				{ canView: false, canUpgrade: false },
			);
			assert(!compatibility.upgrade.isCompatible);
			assertIncompatibilities(compatibility.upgrade.incompatibilities, [
				{
					mismatch: "fieldKind",
					location: "root",
					proposed: "Value",
					stored: "Optional",
				},
			]);
		});

		// Each policy must retain changes already present in the document.
		// The separate blocker field forces a failure report, which must not blame the retained staged change.
		for (const policy of ["restrictive", "enabled", "preserveEnabled"] as const) {
			it(`uses the ${policy} policy's proposed allowed types rather than the view's types`, () => {
				const stagedString = factory.staged(factory.string);
				const upgrade = stagedString.metadata.stagedSchemaUpgrade;
				assert(upgrade !== undefined);
				class Stored extends factory.object(`diagnostics.StagedTypes.${policy}`, {
					value: [factory.number, factory.string],
					blocker: factory.optional(factory.number),
					text: factory.string,
				}) {}
				class View extends factory.objectAlpha(`diagnostics.StagedTypes.${policy}`, {
					value: factory.types([factory.number, stagedString]),
					blocker: factory.number,
					text: factory.string,
				}) {}
				const upgradePolicy =
					policy === "enabled"
						? StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade)
						: {
								...StagedSchemaUpgradePolicy.restrictive,
								includeAlreadyEnabledUpgrades: policy === "preserveEnabled",
							};
				const compatibility = expectCompatibility(
					{ view: View, stored: toUpgradeSchema(Stored) },
					{
						canView: false,
						canUpgrade: false,
						enabledUpgrades: new Map([[upgrade, "enabled"]]),
					},
					upgradePolicy,
				);
				assertIncompatibilities(compatibility.discrepancies, [
					{
						mismatch: "fieldKind",
						location: { nodeType: View.identifier, fieldKey: "blocker" },
						view: "Value",
						stored: "Optional",
					},
				]);
				assert(!compatibility.upgrade.isCompatible);
				assertIncompatibilities(compatibility.upgrade.incompatibilities, [
					{
						mismatch: "fieldKind",
						location: { nodeType: View.identifier, fieldKey: "blocker" },
						proposed: "Value",
						stored: "Optional",
					},
				]);
			});

			it(`uses the ${policy} policy's proposed staged-optional field kind`, () => {
				const stagedField = factory.stagedOptional(factory.number);
				const upgrade = stagedField.isStagedOptional;
				assert(upgrade !== undefined && upgrade !== false);
				class Stored extends factory.object(`diagnostics.StagedOptional.${policy}`, {
					value: factory.optional(factory.number),
					blocker: factory.optional(factory.number),
				}) {}
				class View extends factory.objectAlpha(`diagnostics.StagedOptional.${policy}`, {
					value: stagedField,
					blocker: factory.number,
				}) {}
				const upgradePolicy =
					policy === "enabled"
						? StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade)
						: {
								...StagedSchemaUpgradePolicy.restrictive,
								includeAlreadyEnabledUpgrades: policy === "preserveEnabled",
							};
				const compatibility = expectCompatibility(
					{ view: View, stored: toUpgradeSchema(Stored) },
					{
						canView: false,
						canUpgrade: false,
						enabledUpgrades: new Map([[upgrade, "enabled"]]),
					},
					upgradePolicy,
				);
				assertIncompatibilities(compatibility.discrepancies, [
					{
						mismatch: "fieldKind",
						location: { nodeType: View.identifier, fieldKey: "blocker" },
						view: "Value",
						stored: "Optional",
					},
				]);
				assert(!compatibility.upgrade.isCompatible);
				assertIncompatibilities(compatibility.upgrade.incompatibilities, [
					{
						mismatch: "fieldKind",
						location: { nodeType: View.identifier, fieldKey: "blocker" },
						proposed: "Value",
						stored: "Optional",
					},
				]);
			});
		}
	});

	it("works with never trees", () => {
		class NeverObject extends factory.objectRecursive("NeverObject", {
			foo: factory.requiredRecursive([() => NeverObject]),
		}) {}

		const neverField = factory.required([]);
		expectCompatibility(
			{ view: NeverObject, stored: emptySchema },
			{ canView: false, canUpgrade: false },
		);

		expectCompatibility(
			{ view: neverField, stored: emptySchema },
			{ canView: false, canUpgrade: false },
		);

		// We could reasonably detect these cases as equivalent and update the test expectation here.
		// Doing so would amount to normalizing optional fields to forbidden fields when they do not
		// contain any constructible types.
		// Until we have a use case for it, we can leave it as is (i.e. be stricter with compatibility
		// in cases that realistic users probably won't encounter).
		expectCompatibility(
			{ view: factory.optional(NeverObject), stored: emptySchema },
			{ canView: false, canUpgrade: true },
		);
		expectCompatibility(
			{ view: factory.optional([]), stored: emptySchema },
			{ canView: false, canUpgrade: true },
		);
	});

	describe("isEquivalent (deprecated)", () => {
		function expectSelfEquivalent(view: ImplicitFieldSchema) {
			const compatibility = expectCompatibility(
				{ view, stored: toUpgradeSchema(view) },
				{ canView: true, canUpgrade: true },
			);
			assert.equal(compatibility.isEquivalent, true);
		}
		it("empty schema", () => {
			expectSelfEquivalent(factory.optional([]));
			expectSelfEquivalent(factory.required([]));
		});

		it("object", () => {
			expectSelfEquivalent(
				factory.objectAlpha("foo", {
					x: factory.number,
					y: factory.number,
					baz: factory.string,
				}),
			);
		});

		it("map", () => {
			expectSelfEquivalent(factory.map("foo", [factory.number, factory.boolean]));
		});

		it("array", () => {
			expectSelfEquivalent(factory.array(factory.number));
		});

		it("leaf", () => {
			expectSelfEquivalent(factory.number);
			expectSelfEquivalent(factory.boolean);
			expectSelfEquivalent(factory.string);
		});

		it("recursive", () => {
			class RecursiveObject extends factory.objectRecursive("foo", {
				x: factory.optionalRecursive([() => RecursiveObject]),
			}) {}
			expectSelfEquivalent(RecursiveObject);
		});

		it("is false when the schemas cannot be viewed or upgraded", () => {
			const compatibility = checkSchemaCompatibility(
				new TreeViewConfigurationAlpha({ schema: factory.string }),
				toUpgradeSchema(factory.number),
			);
			assert.equal(compatibility.canView, false);
			assert.equal(compatibility.canUpgrade, false);
			assert.equal(compatibility.isEquivalent, false);
		});

		it("is false when unknown optional fields are retained by a no-op upgrade", () => {
			class StoredPoint extends factory.object("Point", {
				x: factory.number,
				y: factory.optional(factory.number),
			}) {}
			class ViewPoint extends factory.object(
				"Point",
				{ x: factory.number },
				{ allowUnknownOptionalFields: true },
			) {}
			const compatibility = checkSchemaCompatibility(
				new TreeViewConfigurationAlpha({ schema: ViewPoint }),
				toUpgradeSchema(StoredPoint),
			);
			assert.equal(compatibility.canView, true);
			assert.equal(compatibility.canUpgrade, true);
			assert.equal(compatibility.isEquivalent, false);
		});

		it("is false when viewing and upgrading are allowed but an upgrade expands the stored schema", () => {
			const stagedString = factory.staged(factory.string);
			const upgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(upgrade !== undefined);
			const schema = factory.types([factory.number, stagedString]);
			const compatibility = checkSchemaCompatibility(
				new TreeViewConfigurationAlpha({ schema }),
				toUpgradeSchema(factory.number),
				StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
			);
			assert.equal(compatibility.canView, true);
			assert.equal(compatibility.canUpgrade, true);
			assert.equal(compatibility.isEquivalent, false);
		});

		/**
		 * V1 stages strings and V2 enables them.
		 * V1's restrictive upgrade preserves V2's strings without changing the document, but a new V1 document still excludes them.
		 * Equivalence must remain false until V1's configured policy also enables strings.
		 */
		it("compares generated schema rather than retained staged types", () => {
			const stagedString = factory.staged(factory.string);
			const upgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(upgrade !== undefined);
			const schemaV1 = factory.types([factory.number, stagedString]);
			const schemaV2 = [factory.number, factory.string] as const;
			const stored = toInitialSchema(schemaV2);
			const view = new TreeViewConfigurationAlpha({ schema: schemaV1 });

			const compatibility = checkSchemaCompatibility(view, stored);
			assert.equal(compatibility.canView, true);
			assert.equal(compatibility.canUpgrade, true);
			assert.equal(compatibility.isEquivalent, false);

			// A non-equivalent configuration can still produce a no-op upgrade for this document.
			expectSchemaEqual(
				getSchemaUpgradeCandidate(view, stored, StagedSchemaUpgradePolicy.restrictive),
				stored,
			);
			expectSchemaEqual(toInitialSchema(schemaV1), toInitialSchema(factory.number));

			const enabled = checkSchemaCompatibility(
				view,
				stored,
				StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
			);
			assert.equal(enabled.canView, true);
			assert.equal(enabled.canUpgrade, true);
			assert.equal(enabled.isEquivalent, true);
		});

		/**
		 * V1 stages root optionality and V2 fully enables it.
		 * V1 can preserve V2's optional root, but its restrictive policy still creates required roots in new documents.
		 * Only explicitly enabling optionality makes the generated schema equivalent.
		 */
		it("compares generated schema rather than retained staged optionality", () => {
			const schemaV1 = factory.stagedOptional(factory.number);
			const upgrade = schemaV1.isStagedOptional;
			assert(upgrade !== false);
			const schemaV2 = factory.optional(factory.number);
			const stored = toInitialSchema(schemaV2);
			const view = new TreeViewConfigurationAlpha({ schema: schemaV1 });

			const compatibility = checkSchemaCompatibility(view, stored);
			assert.equal(compatibility.canView, true);
			assert.equal(compatibility.canUpgrade, true);
			assert.equal(compatibility.isEquivalent, false);
			expectSchemaEqual(
				getSchemaUpgradeCandidate(view, stored, StagedSchemaUpgradePolicy.restrictive),
				stored,
			);
			expectSchemaEqual(toInitialSchema(schemaV1), toInitialSchema(factory.number));

			const enabled = checkSchemaCompatibility(
				view,
				stored,
				StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
			);
			assert.equal(enabled.canView, true);
			assert.equal(enabled.canUpgrade, true);
			assert.equal(enabled.isEquivalent, true);
		});

		/**
		 * V1 stages strings at two fields using one token; V2 enables them only at the primary field.
		 * V1's restrictive upgrade is a no-op, but neither a disabled nor enabled token generates V2's partial state.
		 * Equivalence becomes true only when the configured token and both stored locations are enabled.
		 */
		it("does not treat a partially enabled token as generated-schema equivalence", () => {
			const stagedString = factory.staged(factory.string);
			const upgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(upgrade !== undefined);
			const priorities = factory.types([factory.number, stagedString]);
			class TaskV1 extends factory.object("PartialEquivalence", {
				primary: priorities,
				fallback: priorities,
			}) {}
			class TaskV2 extends factory.object("PartialEquivalence", {
				primary: [factory.number, factory.string],
				fallback: factory.number,
			}) {}
			const view = new TreeViewConfigurationAlpha({ schema: TaskV1 });
			const stored = toInitialSchema(TaskV2);
			const compatibility = checkSchemaCompatibility(view, stored);
			assert.equal(compatibility.canView, true);
			assert.equal(compatibility.canUpgrade, true);
			assert.equal(compatibility.isEquivalent, false);
			assert.equal(compatibility.enabledUpgrades.get(upgrade), "partial");
			expectSchemaEqual(
				getSchemaUpgradeCandidate(view, stored, StagedSchemaUpgradePolicy.restrictive),
				stored,
			);

			// Enabling the shared token would add fallback strings, so it is not equivalent to the partial document either.
			const policy = StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade);
			const enabled = checkSchemaCompatibility(view, stored, policy);
			assert.equal(enabled.canView, true);
			assert.equal(enabled.canUpgrade, true);
			assert.equal(enabled.isEquivalent, false);
			assert.equal(
				checkSchemaCompatibility(view, toInitialSchema(TaskV1, policy), policy).isEquivalent,
				true,
			);
		});
	});

	describe("allows upgrades but not viewing when the view schema allows a strict superset of the stored schema", () => {
		const expected: Pick<SchemaCompatibilityStatus, "canView" | "canUpgrade"> = {
			canView: false,
			canUpgrade: true,
		};

		// Add allowed types to map node
		it("view: SomethingMap ⊃ stored: NeverMap", () => {
			class NeverMap extends factory.map("TestNode", []) {}
			class SomethingMap extends factory.mapRecursive("TestNode", [factory.number]) {}
			expectCompatibility({ view: SomethingMap, stored: toUpgradeSchema(NeverMap) }, expected);
		});

		// Add allowed types to object node
		it("view: FlexibleObject ⊃ stored: StricterObject", () => {
			class StricterObject extends factory.object("TestNode", {
				x: factory.number,
			}) {}
			class FlexibleObject extends factory.object("TestNode", {
				x: [factory.number, factory.string],
			}) {}
			expectCompatibility(
				{ view: FlexibleObject, stored: toUpgradeSchema(StricterObject) },
				expected,
			);
		});
		// Add optional field to existing schema
		it("view: optional 3d Point ⊃ stored: 2d Point", () => {
			class Point2D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
			}) {}
			class Point3D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}
			expectCompatibility({ view: Point3D, stored: toUpgradeSchema(Point2D) }, expected);
		});

		describe("due to field kind relaxation", () => {
			it("stored identifier", () => {
				// Identifiers are strings, so they should only be relaxable to fields which support strings.
				expectCompatibility(
					{
						view: factory.string,
						stored: toUpgradeSchema(factory.identifier),
					},
					expected,
				);
				expectCompatibility(
					{
						view: factory.number,
						stored: toUpgradeSchema(factory.identifier),
					},
					{ canView: false, canUpgrade: false },
				);

				expectCompatibility(
					{
						view: factory.optional(factory.string),
						stored: toUpgradeSchema(factory.identifier),
					},
					expected,
				);
			});
			it("view: optional field ⊃ stored: required field", () => {
				expectCompatibility(
					{
						view: factory.optional(factory.number),
						stored: toUpgradeSchema(factory.required(factory.number)),
					},
					expected,
				);
			});
			it("view: optional field ⊃ stored: forbidden field", () => {
				expectCompatibility(
					{
						view: factory.optional(factory.number),
						stored: emptySchema,
					},
					expected,
				);
			});

			it("required string to identifier: fails", () => {
				// If this upgrade was allowed then it would be possible for two app versions to disagree
				// about a schema and upgrade it back and forth causing unlimited schema edits.
				// Preventing this is a policy choice: it could be allowed without corrupting documents since identifiers and
				// required strings are compatible field shapes.
				expectCompatibility(
					{
						view: factory.identifier,
						stored: toUpgradeSchema(factory.string),
					},
					{
						canView: false,
						canUpgrade: false,
					},
				);
			});

			it("to sequence", () => {
				// Optional and required fields are relaxable to sequence fields in the stored schema representation.
				// This is possible to recreate using the current public API with object and array nodes:
				expectCompatibility(
					{
						view: factory.array("x", factory.string),
						stored: toUpgradeSchema(factory.object("x", { [EmptyKey]: factory.string })),
					},
					{
						canView: false,
						canUpgrade: true,
					},
				);

				expectCompatibility(
					{
						view: factory.array("x", factory.string),
						stored: toUpgradeSchema(
							factory.object("x", { [EmptyKey]: factory.optional(factory.string) }),
						),
					},
					{
						canView: false,
						canUpgrade: true,
					},
				);

				expectCompatibility(
					{
						view: factory.array("x", factory.string),
						stored: toUpgradeSchema(factory.object("x", { [EmptyKey]: factory.identifier })),
					},
					{
						canView: false,
						canUpgrade: true,
					},
				);
			});
		});
	});

	it("object to map upgrade", () => {
		expectCompatibility(
			{
				view: factory.map("x", [factory.string, factory.number]),
				stored: toUpgradeSchema(
					factory.object("x", {
						a: factory.string,
						b: factory.number,
						c: factory.optional(factory.number),
						d: [factory.string, factory.number],
					}),
				),
			},
			{
				canView: false,
				canUpgrade: true,
			},
		);
	});

	describe("allows viewing and no-op upgrades when the view permits unknown optional fields", () => {
		it("due to additional optional fields in the stored schema", () => {
			class Point2D extends factory.object(
				"Point",
				{
					x: factory.number,
					y: factory.number,
				},
				{ allowUnknownOptionalFields: true },
			) {}
			class Point3D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}
			expectCompatibility(
				{ view: Point2D, stored: toUpgradeSchema(Point3D) },
				{
					canView: true,
					canUpgrade: true,
				},
			);
		});

		it("the stored schema has additional optional fields, which the view schema allows by default", () => {
			class Point2D extends factory.objectAlpha("Point", {
				x: factory.number,
				y: factory.number,
			}) {}
			class Point3D extends factory.objectAlpha("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}
			expectCompatibility(
				{ view: Point2D, stored: toUpgradeSchema(Point3D) },
				{
					canView: true,
					canUpgrade: true,
				},
			);
		});
	});

	describe("forbids viewing and upgrading", () => {
		describe("when the view schema and stored schema are incomparable", () => {
			// (i.e. neither is a subset of the other, hence each allows documents the other does not)
			function expectIncomparability(a: ImplicitFieldSchema, b: ImplicitFieldSchema): void {
				const expected: Pick<SchemaCompatibilityStatus, "canView" | "canUpgrade"> = {
					canView: false,
					canUpgrade: false,
				};
				expectCompatibility({ view: a, stored: toUpgradeSchema(b) }, expected);
				expectCompatibility({ view: b, stored: toUpgradeSchema(a) }, expected);
			}

			describe("due to an allowed type difference", () => {
				it("at the root", () => {
					expectIncomparability(factory.number, factory.string);
				});

				it("in an object", () => {
					class IncompatibleObject1 extends factory.object("TestNode", {
						x: factory.number,
					}) {}
					class IncompatibleObject2 extends factory.objectRecursive("TestNode", {
						x: factory.optionalRecursive([() => IncompatibleObject2]),
					}) {}
					expectIncomparability(IncompatibleObject1, IncompatibleObject2);
				});

				it("in a map", () => {
					class IncompatibleMap1 extends factory.map("TestNode", [
						factory.null,
						factory.number,
					]) {}
					class IncompatibleMap2 extends factory.map("TestNode", [
						factory.null,
						factory.string,
					]) {}
					expectIncomparability(IncompatibleMap1, IncompatibleMap2);
				});
			});

			it("due to array vs not array differences", () => {
				expectIncomparability(factory.array(factory.number), factory.number);
				expectIncomparability(factory.array(factory.number), factory.optional(factory.number));
				expectIncomparability(factory.array(factory.string), factory.identifier);
			});

			it("view: 2d Point vs stored: required 3d Point", () => {
				class Point2D extends factory.object("Point", {
					x: factory.number,
					y: factory.number,
				}) {}
				class Point3D extends factory.object("Point", {
					x: factory.number,
					y: factory.number,
					z: factory.number,
				}) {}
				expectIncomparability(Point2D, Point3D);
			});
		});

		describe("when the view schema allows a subset of the stored schema's documents but in ways that misalign with allowed viewing policies", () => {
			const expected: Pick<SchemaCompatibilityStatus, "canView" | "canUpgrade"> = {
				canView: false,
				canUpgrade: false,
			};

			// This case demonstrates some need for care when allowing view schema to open documents with more flexible stored schema
			it("stored schema has optional fields where view schema expects content", () => {
				expectCompatibility(
					{
						view: factory.identifier,
						stored: toUpgradeSchema(factory.optional(factory.string)),
					},
					expected,
				);
				expectCompatibility(
					{
						view: factory.number,
						stored: toUpgradeSchema(factory.optional(factory.number)),
					},
					expected,
				);
			});

			describe("stored schema has additional unadapted allowed types", () => {
				it("at the root", () => {
					expectCompatibility(
						{
							view: factory.number,
							stored: toUpgradeSchema(factory.required([factory.number, factory.string])),
						},
						expected,
					);
				});

				it("in an object", () => {
					class IncompatibleObject1 extends factory.objectAlpha("TestNode", {
						x: factory.number,
					}) {}
					class IncompatibleObject2 extends factory.objectAlpha("TestNode", {
						x: [factory.number, factory.string],
					}) {}
					expectCompatibility(
						{ view: IncompatibleObject1, stored: toUpgradeSchema(IncompatibleObject2) },
						expected,
					);
				});

				it("in a map", () => {
					class IncompatibleMap1 extends factory.map("TestNode", [factory.number]) {}
					class IncompatibleMap2 extends factory.map("TestNode", [
						factory.number,
						factory.string,
					]) {}
					expectCompatibility(
						{ view: IncompatibleMap1, stored: toUpgradeSchema(IncompatibleMap2) },
						expected,
					);
				});
			});
		});
	});

	describe("with staged changes and unknown optional fields", () => {
		for (const enabled of [false, true]) {
			it(`applies the supplied staged policy while retaining unknown fields (${enabled ? "enabled" : "disabled"})`, () => {
				class Before extends factory.object("Task", {
					isArchived: factory.optional(factory.boolean),
					estimatedHours: factory.number,
					priority: factory.number,
				}) {}

				// Remove `isArchived`.
				// Stage two changes: allow `estimatedHours` to be absent and allow `priority` to contain strings as well as numbers.
				class After extends factory.object("Task", {
					estimatedHours: factory.stagedOptional(factory.number),
					priority: factory.types([factory.number, factory.staged(factory.string)]),
				}) {}
				const policy = enabled
					? StagedSchemaUpgradePolicy.permissive
					: StagedSchemaUpgradePolicy.restrictive;

				// The view tolerates the unknown archive flag and the existing required, numeric fields under either policy.
				// Retaining `isArchived` permits upgrading but must not enable the staged changes by itself.
				// Only the permissive policy enables new staged upgrades, changing the stored schema.
				expectCompatibility(
					{ view: After, stored: toInitialSchema(Before) },
					{
						canView: true,
						canUpgrade: true,
					},
					policy,
				);
			});
		}
	});

	describe("with staged allowed types", () => {
		for (const location of ["root", "array", "map"] as const) {
			it(`preserves newer document types without enabling them in documents created by the older schema (${location})`, () => {
				const priorities = [factory.number, factory.string] as const;
				const stagedString = factory.staged(factory.string);
				const upgrade = stagedString.metadata.stagedSchemaUpgrade;
				assert(upgrade !== undefined);
				const stagedPriorities = factory.types([factory.number, stagedString]);
				const before: ImplicitFieldSchema =
					location === "root"
						? stagedPriorities
						: location === "array"
							? factory.array("Priorities", stagedPriorities)
							: factory.map("Priorities", stagedPriorities);

				// Fully enable string priorities in the later schema.
				const after: ImplicitFieldSchema =
					location === "root"
						? priorities
						: location === "array"
							? factory.array("Priorities", priorities)
							: factory.map("Priorities", priorities);
				const stored = toInitialSchema(after);
				const fresh = toInitialSchema(before);

				// The older staged view can read the newer document and request a no-op upgrade that retains strings.
				expectCompatibility(
					{ view: before, stored },
					{
						canView: true,
						canUpgrade: true,
						enabledUpgrades: new Map([[upgrade, "enabled"]]),
					},
					StagedSchemaUpgradePolicy.restrictive,
				);

				// A document initialized by the older view is numeric-only; requesting an upgrade with that view keeps staging disabled.
				expectCompatibility(
					{ view: before, stored: fresh },
					{ canView: true, canUpgrade: true },
					StagedSchemaUpgradePolicy.restrictive,
				);

				// The later view must upgrade the older numeric-only document before it can write strings.
				expectCompatibility(
					{ view: after, stored: fresh },
					{ canView: false, canUpgrade: true },
				);

				// Explicitly enabling the staged token also permits adding strings; this is a real upgrade, not a no-op.
				expectCompatibility(
					{ view: before, stored: fresh },
					{ canView: true, canUpgrade: true },
					StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
				);
			});
		}

		it("adding a staged allowed type does not break compatibility", () => {
			class Compatible1 extends factory.object("MyType", {
				foo: SchemaFactoryAlpha.number,
			}) {}

			class Compatible2 extends factory.object("MyType", {
				foo: SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			}) {}

			expectCompatibility(
				{ view: Compatible2, stored: toUpgradeSchema(Compatible1) },
				{ canView: true, canUpgrade: true },
			);
		});

		it("can upgrade from staged to allowed", () => {
			class Compatible1 extends factory.object("MyType", {
				foo: SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			}) {}

			class Compatible2 extends factory.object("MyType", {
				foo: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.string],
			}) {}

			expectCompatibility(
				{ view: Compatible2, stored: toUpgradeSchema(Compatible1) },
				{ canView: false, canUpgrade: true },
			);
		});

		it("clients with staged schema can preserve already enabled upgrades", () => {
			const stagedString = SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string);
			const upgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(upgrade !== undefined);

			class Compatible1 extends factory.object("MyType", {
				foo: SchemaFactoryAlpha.types([SchemaFactoryAlpha.number, stagedString]),
			}) {}

			class Compatible2 extends factory.object("MyType", {
				foo: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.string],
			}) {}

			expectCompatibility(
				{ view: Compatible1, stored: toUpgradeSchema(Compatible2) },
				{
					canView: true,
					canUpgrade: true,
					enabledUpgrades: new Map([[upgrade, "enabled"]]),
				},
				StagedSchemaUpgradePolicy.restrictive,
			);
		});

		it("staged schema which mismatches stored can not view", () => {
			class Compatible1 extends factory.object("MyType", {
				foo: SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			}) {}

			class Compatible2 extends factory.object("MyType", {
				foo: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.null],
			}) {}

			expectCompatibility(
				{ view: Compatible1, stored: toUpgradeSchema(Compatible2) },
				{ canView: false, canUpgrade: false },
			);
		});

		it("staged schema which deeply mismatches stored can not view", () => {
			class Deep1 extends factory.object("Deep", {
				foo: SchemaFactoryAlpha.number,
			}) {}

			class Deep2 extends factory.object("Deep", {
				bar: SchemaFactoryAlpha.number,
			}) {}

			const stagedDeep = SchemaFactoryAlpha.staged(Deep1);
			const upgrade = stagedDeep.metadata.stagedSchemaUpgrade;
			assert(upgrade !== undefined);

			class Compatible1 extends factory.object("MyType", {
				foo: SchemaFactoryAlpha.types([SchemaFactoryAlpha.number, stagedDeep]),
			}) {}

			class Compatible2 extends factory.object("MyType", {
				foo: [SchemaFactoryAlpha.number, Deep2],
			}) {}

			expectCompatibility(
				{ view: Compatible1, stored: toUpgradeSchema(Compatible2) },
				{
					canView: false,
					canUpgrade: false,
					enabledUpgrades: new Map([[upgrade, "enabled"]]),
				},
			);
		});
	});
});

describe("checkSchemaCompatibility upgrade incompatibilities", () => {
	it("preserves discriminated value types without viewing-specific properties", () => {
		// These compile-time checks guard narrowing and prevent view-only properties from leaking into upgrade variants.
		interface ExpectedValues {
			allowedTypes: readonly string[];
			fieldKind: string;
			valueSchema: string | undefined;
			nodeKind: string;
		}
		type ComparisonKeys = "mismatch" | "proposed" | "stored" | "reason";
		allowUnused<
			requireTrue<
				areSafelyAssignable<
					{
						[Mismatch in keyof ExpectedValues]: Extract<
							SchemaUpgradeIncompatibility,
							{ mismatch: Mismatch }
						>["proposed"];
					},
					ExpectedValues
				>
			>
		>();
		allowUnused<
			requireTrue<
				areSafelyAssignable<
					{
						[Mismatch in keyof ExpectedValues]: keyof Extract<
							SchemaUpgradeIncompatibility,
							{ mismatch: Mismatch }
						>;
					},
					{
						allowedTypes: ComparisonKeys | "location";
						fieldKind: ComparisonKeys | "location";
						valueSchema: ComparisonKeys | "nodeType";
						nodeKind: ComparisonKeys | "nodeType";
					}
				>
			>
		>();
	});

	it("explains a required field that allows no child types", () => {
		class Stored extends factory.object("diagnostics.Uninhabitable", {}) {}
		class Proposed extends factory.object("diagnostics.Uninhabitable", {
			value: factory.required([]),
		}) {}
		const { upgrade } = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: Proposed }),
			toUpgradeSchema(Stored),
		);
		assert(!upgrade.isCompatible);
		assertIncompatibilities(upgrade.incompatibilities, [
			{
				mismatch: "nodeSchemaCannotBeSatisfied",
				nodeType: Stored.identifier,
			},
		]);
		assert.equal(
			upgrade.incompatibilities[0]?.reason,
			'Cannot upgrade node type ".diagnostics.Uninhabitable": required field "value" allows no child types.',
		);
	});

	it("distinguishes existing stored definitions from newly proposed child types", () => {
		class Stored extends factory.object("diagnostics.NewRequiredChild", {}) {}
		class Proposed extends factory.object("diagnostics.NewRequiredChild", {
			value: factory.number,
		}) {}
		// Number exists only in the proposal; the upgrade rule resolves required children against the existing stored definitions.
		const { upgrade } = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: Proposed }),
			toUpgradeSchema(Stored),
		);
		assert(!upgrade.isCompatible);
		assert.deepEqual(upgrade.incompatibilities, [
			{
				mismatch: "nodeSchemaCannotBeSatisfied",
				nodeType: Stored.identifier,
				reason:
					'Cannot upgrade node type ".diagnostics.NewRequiredChild": required field "value" has no child type that can be constructed using the existing stored definitions (allowed types: ["com.fluidframework.leaf.number"]).',
			},
		]);
	});

	it("explains a required child whose stored definition has an unavoidable cycle", () => {
		// The definition exists, unlike a newly proposed child type, but no finite child tree can satisfy it.
		class Never extends factory.objectRecursive("diagnostics.RequiredCycle", {
			child: factory.requiredRecursive([() => Never]),
		}) {}
		class Stored extends factory.object("diagnostics.CycleParent", {}) {}
		class Proposed extends factory.object("diagnostics.CycleParent", {
			child: Never,
		}) {}
		const base = toUpgradeSchema(Stored);
		const { upgrade } = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: Proposed }),
			{
				rootFieldSchema: base.rootFieldSchema,
				nodeSchema: new Map([...base.nodeSchema, ...toUpgradeSchema(Never).nodeSchema]),
			},
		);
		assert(!upgrade.isCompatible);
		assert.deepEqual(upgrade.incompatibilities, [
			{
				mismatch: "nodeSchemaCannotBeSatisfied",
				nodeType: Stored.identifier,
				reason:
					'Cannot upgrade node type ".diagnostics.CycleParent": required field "child" has no child type that can be constructed using the existing stored definitions (allowed types: [".diagnostics.RequiredCycle"]).',
			},
		]);
	});
});

describe("checkSchemaCompatibility enabledUpgrades", () => {
	const schemaFactory = new SchemaFactoryAlpha("findEnabledUpgradesTest");

	it("returns empty map when no upgrades are enabled", () => {
		const baseSchema = schemaFactory.optional([schemaFactory.number]);

		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(baseSchema).rootFieldSchema));
		assert(stored.tryUpdateTreeSchema(schemaStatics.number));

		const config = new TreeViewConfigurationAlpha({ schema: baseSchema });
		const { enabledUpgrades } = checkSchemaCompatibility(config, stored);
		assert.equal(enabledUpgrades.size, 0);
	});

	it("detects enabled staged allowed type upgrade", () => {
		const stagedString = schemaFactory.staged(schemaFactory.string);
		const upgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);

		const schemaWithStaged = schemaFactory.optional(
			schemaFactory.types([schemaFactory.number, stagedString]),
		);

		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(
			stored.tryUpdateRootFieldSchema(
				toUpgradeSchema(
					schemaWithStaged,
					StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
				).rootFieldSchema,
			),
		);
		assert(stored.tryUpdateTreeSchema(schemaStatics.number));
		assert(stored.tryUpdateTreeSchema(schemaStatics.string));

		const config = new TreeViewConfigurationAlpha({ schema: schemaWithStaged });
		const { enabledUpgrades } = checkSchemaCompatibility(config, stored);
		assert.equal(enabledUpgrades.size, 1);
		assert.equal(enabledUpgrades.get(upgrade), "enabled");
	});

	it("does not include upgrades that have not been applied", () => {
		const stagedString = schemaFactory.staged(schemaFactory.string);
		const upgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);

		const schemaWithStaged = schemaFactory.optional(
			schemaFactory.types([schemaFactory.number, stagedString]),
		);

		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaWithStaged).rootFieldSchema));
		assert(stored.tryUpdateTreeSchema(schemaStatics.number));

		const config = new TreeViewConfigurationAlpha({ schema: schemaWithStaged });
		const { enabledUpgrades } = checkSchemaCompatibility(config, stored);
		assert.equal(enabledUpgrades.size, 0);
	});

	it("detects enabled staged optional upgrade", () => {
		const stagedField = schemaFactory.stagedOptional(schemaFactory.number);
		const optionalUpgrade = stagedField.isStagedOptional;
		assert(optionalUpgrade !== false && optionalUpgrade !== undefined);

		class ObjStaged extends schemaFactory.objectAlpha("Obj", {
			value: stagedField,
		}) {}

		const schemaStaged = schemaFactory.required(ObjStaged);

		const stored = new TestSchemaRepository(
			defaultSchemaPolicy,
			toUpgradeSchema(
				schemaStaged,
				StagedSchemaUpgradePolicy.enabledStagedUpgrades(optionalUpgrade),
			),
		);

		const config = new TreeViewConfigurationAlpha({ schema: schemaStaged });
		const { enabledUpgrades } = checkSchemaCompatibility(config, stored);
		assert.equal(enabledUpgrades.size, 1);
		assert.equal(enabledUpgrades.get(optionalUpgrade), "enabled");
	});

	it("does not detect staged optional when stored field is still required", () => {
		const stagedField = schemaFactory.stagedOptional(schemaFactory.number);
		const optionalUpgrade = stagedField.isStagedOptional;
		assert(optionalUpgrade !== false && optionalUpgrade !== undefined);

		class ObjStaged extends schemaFactory.objectAlpha("Obj2", {
			value: stagedField,
		}) {}

		const schemaStaged = schemaFactory.required(ObjStaged);

		const stored = new TestSchemaRepository(
			defaultSchemaPolicy,
			toUpgradeSchema(schemaStaged),
		);

		const config = new TreeViewConfigurationAlpha({ schema: schemaStaged });
		const { enabledUpgrades } = checkSchemaCompatibility(config, stored);
		assert.equal(enabledUpgrades.size, 0);
	});

	it("returns multiple upgrades when several are enabled", () => {
		const stagedString = schemaFactory.staged(schemaFactory.string);
		const stagedBool = schemaFactory.staged(schemaFactory.boolean);
		const upgradeStr = stagedString.metadata.stagedSchemaUpgrade;
		const upgradeBool = stagedBool.metadata.stagedSchemaUpgrade;
		assert(upgradeStr !== undefined);
		assert(upgradeBool !== undefined);

		const schema = schemaFactory.optional(
			schemaFactory.types([schemaFactory.number, stagedString, stagedBool]),
		);

		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(
			stored.tryUpdateRootFieldSchema(
				toUpgradeSchema(
					schema,
					StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgradeStr, upgradeBool),
				).rootFieldSchema,
			),
		);
		assert(stored.tryUpdateTreeSchema(schemaStatics.number));
		assert(stored.tryUpdateTreeSchema(schemaStatics.string));
		assert(stored.tryUpdateTreeSchema(schemaStatics.boolean));

		const config = new TreeViewConfigurationAlpha({ schema });
		const { enabledUpgrades } = checkSchemaCompatibility(config, stored);
		assert.equal(enabledUpgrades.size, 2);
		assert.equal(enabledUpgrades.get(upgradeStr), "enabled");
		assert.equal(enabledUpgrades.get(upgradeBool), "enabled");
	});

	it("counts an upgrade as partial if it's enabled in only some locations", () => {
		const sfLocal = new SchemaFactoryAlpha("enabledInOneLocation");
		const stagedString = sfLocal.staged(sfLocal.string);
		const upgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);

		class ObjV1 extends sfLocal.objectAlpha("Obj", {
			fieldA: sfLocal.optional(sfLocal.types([sfLocal.number, stagedString])),
			fieldB: sfLocal.optional([sfLocal.number]),
		}) {}

		const stored = new TestSchemaRepository(
			defaultSchemaPolicy,
			toUpgradeSchema(
				sfLocal.required(ObjV1),
				StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
			),
		);

		class ObjV2 extends sfLocal.objectAlpha("Obj", {
			fieldA: sfLocal.optional(sfLocal.types([sfLocal.number, stagedString])),
			fieldB: sfLocal.optional(sfLocal.types([sfLocal.number, stagedString])),
		}) {}

		const config = new TreeViewConfigurationAlpha({ schema: sfLocal.required(ObjV2) });
		const { enabledUpgrades } = checkSchemaCompatibility(config, stored);
		assert.equal(enabledUpgrades.size, 1);
		assert.equal(enabledUpgrades.get(upgrade), "partial");
	});

	it("detects enabled upgrades in recursive types", () => {
		const sfLocal = new SchemaFactoryAlpha("recursiveUpgrade");

		// Create the recursive field separately so we can access its metadata
		const childField = sfLocal.stagedOptionalRecursive([() => TreeNode]);

		// Define a recursive node where the child uses stagedOptionalRecursive
		class TreeNode extends sfLocal.objectRecursiveAlpha("TreeNode", {
			value: sfLocal.number,
			child: childField,
		}) {}
		{
			type _check = ValidateRecursiveSchema<typeof TreeNode>;
		}

		const childUpgrade = childField.isStagedOptional;
		assert(childUpgrade !== false && childUpgrade !== undefined);

		const stored = new TestSchemaRepository(
			defaultSchemaPolicy,
			toUpgradeSchema(
				sfLocal.required(TreeNode),
				StagedSchemaUpgradePolicy.enabledStagedUpgrades(childUpgrade),
			),
		);

		const result = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: TreeNode }),
			stored,
		);
		assert(result.enabledUpgrades !== undefined);
		assert.equal(result.enabledUpgrades.get(childUpgrade), "enabled");
	});
});

describe("checkGeneratedSchemaCompatibility", () => {
	/**
	 * Root field schemas to compare with a generated stored schema's node schemas:
	 * the generated root itself, the relaxed root which `initialize` installs first, and roots which differ from it.
	 */
	function storedRootsFor(generated: TreeStoredSchema): TreeFieldStoredSchema[] {
		const root = generated.rootFieldSchema;
		const roots: TreeFieldStoredSchema[] = [
			root,
			{ ...root, kind: FieldKinds.optional.identifier },
			{ ...root, kind: FieldKinds.required.identifier },
			{ ...root, types: new Set() },
		];
		const [firstType] = root.types;
		if (firstType !== undefined && root.types.size > 1) {
			roots.push({ ...root, types: new Set([firstType]) });
		}
		const otherType = [...generated.nodeSchema.keys()].find((type) => !root.types.has(type));
		if (otherType !== undefined) {
			roots.push({
				...root,
				types: new Set<TreeNodeSchemaIdentifier>([...root.types, otherType]),
			});
		}
		return roots;
	}

	for (const testCase of testSchema) {
		if (testCase.hasStagedSchema === true) {
			continue;
		}
		it(`matches checkSchemaCompatibility for ${testCase.name}`, () => {
			const view = new TreeViewConfigurationAlpha({ schema: testCase.schema });
			const generated = toInitialSchema(view.root, view.stagedUpgradePolicy);
			for (const storedRoot of storedRootsFor(generated)) {
				const stored: TreeStoredSchema = {
					nodeSchema: generated.nodeSchema,
					rootFieldSchema: storedRoot,
				};
				assert.deepEqual(
					checkGeneratedSchemaCompatibility(view, generated, storedRoot),
					checkSchemaCompatibility(view, stored, view.stagedUpgradePolicy),
				);
			}
		});
	}
});
