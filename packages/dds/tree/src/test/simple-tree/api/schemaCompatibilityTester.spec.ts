/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	storedEmptyFieldSchema,
	type TreeStoredSchema,
	ValueSchema,
} from "../../../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { LeafNodeSchema } from "../../../simple-tree/leafNodeSchema.js";
import {
	checkSchemaCompatibility,
	getViewBlockers,
	getSchemaUpgradeCandidate,
	isSchemaUpgradeAllowed,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	type SchemaUpgrade,
	type StagedUpgradeStatus,
	type ValidateRecursiveSchema,
	schemaStatics,
	StagedSchemaUpgradePolicy,
	TreeViewConfigurationAlpha,
	toInitialSchema,
	toUpgradeSchema,
} from "../../../simple-tree/index.js";
import { SchemaFactoryAlpha } from "../../../simple-tree/index.js";
import { TestSchemaRepository } from "../../utils.js";

const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: storedEmptyFieldSchema,
};

const factory = new SchemaFactoryAlpha("");

function expectCompatibility(
	{ view, stored }: { view: ImplicitFieldSchema; stored: TreeStoredSchema },
	expected: Omit<
		ReturnType<typeof checkSchemaCompatibility>,
		"enabledUpgrades" | "discrepancies"
	> & {
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
	const { discrepancies, ...compatibilityWithoutDiscrepancies } = compatibility;
	assert.deepEqual(compatibilityWithoutDiscrepancies, {
		enabledUpgrades: new Map(),
		...expected,
	});
	assert.equal(discrepancies === undefined, compatibility.canView);

	const candidate = getSchemaUpgradeCandidate(
		viewSchema,
		stored,
		viewSchema.stagedUpgradePolicy,
	).schema;

	// A permitted upgrade preserves existing content and produces a stored schema that the view can read and edit.
	if (compatibility.canUpgrade) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, candidate), true);
		assert.equal(getViewBlockers(viewSchema, candidate), undefined);
	}

	// Equivalence compares the candidate with the existing stored schema in both directions.
	// Viewing alone does not imply equivalence: the policy may request additional staged changes.
	if (compatibility.isEquivalent) {
		assert.equal(compatibility.canView, true);
		assert.equal(compatibility.canUpgrade, true);
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, candidate, stored), true);
	}
}

describe("getViewBlockers", () => {
	it("returns undefined for compatible schema", () => {
		const schema = new TreeViewConfigurationAlpha({ schema: factory.number });
		assert.equal(getViewBlockers(schema, toUpgradeSchema(factory.number)), undefined);
	});

	it("formats an allowed types discrepancy", () => {
		const schema = new TreeViewConfigurationAlpha({ schema: factory.string });
		assert.deepEqual(getViewBlockers(schema, toUpgradeSchema(factory.number)), [
			{
				mismatch: "allowedTypes",
				location: "root",
				view: [factory.string.identifier],
				stored: [factory.number.identifier],
			},
		]);
	});

	it("formats all discrepancies", () => {
		const schema = new TreeViewConfigurationAlpha({
			schema: factory.optional(factory.string),
		});
		assert.deepEqual(
			getViewBlockers(schema, toUpgradeSchema(factory.required(factory.number))),
			[
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
			],
		);
	});

	it("formats a value schema discrepancy", () => {
		const identifier = "valueSchema";
		const viewLeaf = new LeafNodeSchema(identifier, ValueSchema.Number);
		const storedLeaf = new LeafNodeSchema(identifier, ValueSchema.String);
		const schema = new TreeViewConfigurationAlpha({ schema: viewLeaf });
		assert.deepEqual(getViewBlockers(schema, toUpgradeSchema(storedLeaf)), [
			{
				mismatch: "valueSchema",
				nodeType: identifier,
				view: "Number",
				stored: "String",
			},
		]);
	});

	it("formats a node kind discrepancy", () => {
		class ViewNode extends factory.object("nodeKind", {}) {}
		class StoredNode extends factory.map("nodeKind", []) {}
		const schema = new TreeViewConfigurationAlpha({ schema: ViewNode });
		assert.deepEqual(getViewBlockers(schema, toUpgradeSchema(StoredNode)), [
			{
				mismatch: "nodeKind",
				nodeType: ViewNode.identifier,
				view: "Object",
				stored: "Map",
			},
		]);
	});

	it("formats staged allowed type context", () => {
		class ViewNode extends factory.objectAlpha("stagedAllowedTypeDetails", {
			foo: factory.types([factory.number, factory.staged(factory.string)]),
		}) {}
		class StoredNode extends factory.objectAlpha("stagedAllowedTypeDetails", {
			foo: [factory.number, factory.null],
		}) {}
		const schema = new TreeViewConfigurationAlpha({ schema: ViewNode });

		assert.deepEqual(getViewBlockers(schema, toUpgradeSchema(StoredNode)), [
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
	});

	it("formats staged optional field context", () => {
		class ViewNode extends factory.objectAlpha("stagedOptionalDetails", {
			foo: factory.stagedOptional(factory.number),
		}) {}
		class StoredNode extends factory.objectAlpha("stagedOptionalDetails", {}) {}
		const schema = new TreeViewConfigurationAlpha({ schema: ViewNode });

		assert.deepEqual(getViewBlockers(schema, toUpgradeSchema(StoredNode)), [
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

		// Viewing is blocked before the upgrade, but the candidate adds the missing permission without removing anything.
		assert.notEqual(getViewBlockers(view, stored), undefined);
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
		assert.equal(getViewBlockers(view, candidate), undefined);
		assert.equal(isSchemaUpgradeAllowed(view, stored, candidate), false);
	});

	it("rejects a composed superset that the view cannot read", () => {
		class Before extends factory.object("Task", {
			priority: [factory.number, factory.string],
		}) {}

		// Drop support for string priorities while adding optional notes.
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
		).schema;

		// Composition retains both priority types and adds notes, but cannot make the numeric-only view tolerate strings.
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, candidate), true);
		assert.equal(isSchemaUpgradeAllowed(view, stored, candidate), false);
	});
});

describe("checkSchemaCompatibility", () => {
	it("works with never trees", () => {
		class NeverObject extends factory.objectRecursive("NeverObject", {
			foo: factory.requiredRecursive([() => NeverObject]),
		}) {}

		const neverField = factory.required([]);
		expectCompatibility(
			{ view: NeverObject, stored: emptySchema },
			{ canView: false, canUpgrade: false, isEquivalent: false },
		);

		expectCompatibility(
			{ view: neverField, stored: emptySchema },
			{ canView: false, canUpgrade: false, isEquivalent: false },
		);

		// We could reasonably detect these cases as equivalent and update the test expectation here.
		// Doing so would amount to normalizing optional fields to forbidden fields when they do not
		// contain any constructible types.
		// Until we have a use case for it, we can leave it as is (i.e. be stricter with compatibility
		// in cases that realistic users probably won't encounter).
		expectCompatibility(
			{ view: factory.optional(NeverObject), stored: emptySchema },
			{ canView: false, canUpgrade: true, isEquivalent: false },
		);
		expectCompatibility(
			{ view: factory.optional([]), stored: emptySchema },
			{ canView: false, canUpgrade: true, isEquivalent: false },
		);
	});

	describe("recognizes identical schema as equivalent", () => {
		function expectSelfEquivalent(view: ImplicitFieldSchema) {
			expectCompatibility(
				{ view, stored: toUpgradeSchema(view) },
				{ canView: true, canUpgrade: true, isEquivalent: true },
			);
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
	});

	describe("allows upgrades but not viewing when the view schema allows a strict superset of the stored schema", () => {
		const expected: Omit<SchemaCompatibilityStatus, "canInitialize"> = {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
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
					{ canView: false, canUpgrade: false, isEquivalent: false },
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
						isEquivalent: false,
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
						isEquivalent: false,
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
						isEquivalent: false,
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
						isEquivalent: false,
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
				isEquivalent: false,
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
					isEquivalent: true,
					retainedUnknownOptionalFields: [{ nodeType: Point2D.identifier, fieldKey: "z" }],
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
					isEquivalent: true,
					retainedUnknownOptionalFields: [{ nodeType: Point2D.identifier, fieldKey: "z" }],
				},
			);
		});
	});

	describe("forbids viewing and upgrading", () => {
		describe("when the view schema and stored schema are incomparable", () => {
			// (i.e. neither is a subset of the other, hence each allows documents the other does not)
			function expectIncomparability(a: ImplicitFieldSchema, b: ImplicitFieldSchema): void {
				const expected: Omit<SchemaCompatibilityStatus, "canInitialize"> = {
					canView: false,
					canUpgrade: false,
					isEquivalent: false,
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
			const expected: Omit<SchemaCompatibilityStatus, "canInitialize"> = {
				canView: false,
				canUpgrade: false,
				isEquivalent: false,
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
				// Only the permissive policy adds new permissions, making the upgrade non-equivalent to the stored schema.
				expectCompatibility(
					{ view: After, stored: toInitialSchema(Before) },
					{
						canView: true,
						canUpgrade: true,
						isEquivalent: !enabled,
						retainedUnknownOptionalFields: [
							{ nodeType: After.identifier, fieldKey: "isArchived" },
						],
					},
					policy,
				);
			});
		}
	});

	describe("with staged allowed types", () => {
		it("lets an older client enable another staged type without removing types allowed by a newer document", () => {
			const stagedString = factory.staged(factory.string);
			const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(stringUpgrade !== undefined);
			const stagedUnassigned = factory.staged(factory.null);
			const unassignedUpgrade = stagedUnassigned.metadata.stagedSchemaUpgrade;
			assert(unassignedUpgrade !== undefined);

			class Before extends factory.object("Task", {
				priority: factory.types([factory.number, stagedString, stagedUnassigned]),
			}) {}

			// Fully enable string priorities in the later schema, without shipping the staged `null` alternative.
			class After extends factory.object("Task", {
				priority: [factory.number, factory.string],
			}) {}

			// The older view can read the newer document. Enabling only `null` must retain its strings and produce a real upgrade.
			// Enablement status describes the document before the upgrade, so only its string permission is reported.
			expectCompatibility(
				{ view: Before, stored: toInitialSchema(After) },
				{
					canView: true,
					canUpgrade: true,
					isEquivalent: false,
					enabledUpgrades: new Map([[stringUpgrade, "enabled"]]),
				},
				StagedSchemaUpgradePolicy.enabledStagedUpgrades(unassignedUpgrade),
			);
		});

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
						isEquivalent: true,
						enabledUpgrades: new Map([[upgrade, "enabled"]]),
					},
					StagedSchemaUpgradePolicy.restrictive,
				);

				// A document initialized by the older view is numeric-only; requesting an upgrade with that view keeps staging disabled.
				expectCompatibility(
					{ view: before, stored: fresh },
					{ canView: true, canUpgrade: true, isEquivalent: true },
					StagedSchemaUpgradePolicy.restrictive,
				);

				// The later view must upgrade the older numeric-only document before it can write strings.
				expectCompatibility(
					{ view: after, stored: fresh },
					{ canView: false, canUpgrade: true, isEquivalent: false },
				);

				// Explicitly enabling the staged token also permits adding strings; this is a real upgrade, not a no-op.
				expectCompatibility(
					{ view: before, stored: fresh },
					{ canView: true, canUpgrade: true, isEquivalent: false },
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
				{ canView: true, canUpgrade: true, isEquivalent: true },
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
				{ canView: false, canUpgrade: true, isEquivalent: false },
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
					isEquivalent: true,
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
				{ canView: false, canUpgrade: false, isEquivalent: false },
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
					isEquivalent: false,
					enabledUpgrades: new Map([[upgrade, "enabled"]]),
				},
			);
		});
	});
});

describe("checkSchemaCompatibility retained unknown optional fields", () => {
	const schemaFactory = new SchemaFactoryAlpha("retentionDiagnostics");

	it("reports stored keys once in sorted order, including fields that permit no values", () => {
		class MemberBefore extends schemaFactory.object("Member", {
			workdayStartHour: schemaFactory.optional(schemaFactory.number),
			workdayEndHour: schemaFactory.optional(schemaFactory.number),
		}) {}
		class Before extends schemaFactory.object("Task", {
			assignee: MemberBefore,
			reviewer: MemberBefore,
			archiveReason: schemaFactory.optional(schemaFactory.string, { key: "archiveNote" }),
			assignment: schemaFactory.optional([]),
		}) {}

		// Retire work-hour tracking while keeping the stored `Member` identifier.
		class MemberAfter extends schemaFactory.object("Member", {}) {}

		// Remove archive and assignment fields and use the reduced member schema at both references.
		class After extends schemaFactory.object("Task", {
			assignee: MemberAfter,
			reviewer: MemberAfter,
		}) {}
		const result = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: After }),
			toInitialSchema(Before),
		);

		// Repeated references do not duplicate locations, and the empty assignment field is still retained schema.
		// The archive entry uses its stored key rather than the old application property name.
		assert.deepEqual(result.retainedUnknownOptionalFields, [
			{ nodeType: MemberAfter.identifier, fieldKey: "workdayEndHour" },
			{ nodeType: MemberAfter.identifier, fieldKey: "workdayStartHour" },
			{ nodeType: After.identifier, fieldKey: "archiveNote" },
			{ nodeType: After.identifier, fieldKey: "assignment" },
		]);
		assert.equal(result.canView, true);
		assert.equal(result.canUpgrade, true);
		assert.equal(result.isEquivalent, true);
		assert.equal(result.discrepancies, undefined);
	});

	it("reports an omitted node-valued field but not fields inside its unknown node type", () => {
		class Reminder extends schemaFactory.object("Reminder", {
			message: schemaFactory.string,
			snoozedUntil: schemaFactory.optional(schemaFactory.number),
		}) {}
		class Before extends schemaFactory.object("Task", {
			title: schemaFactory.string,
			reminder: schemaFactory.optional(Reminder),
		}) {}

		// Retire reminders, removing the only view reference to their node type.
		class After extends schemaFactory.object("Task", {
			title: schemaFactory.string,
		}) {}
		const result = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: After }),
			toInitialSchema(Before),
		);

		// The report identifies the field omitted from the known Task type, not every field in the retained Reminder definition.
		assert.deepEqual(result.retainedUnknownOptionalFields, [
			{ nodeType: After.identifier, fieldKey: "reminder" },
		]);
	});

	it("reports retained fields alongside blockers that an upgrade can resolve", () => {
		class Before extends schemaFactory.object("Task", {
			title: schemaFactory.string,
			notes: schemaFactory.optional(schemaFactory.string),
		}) {}

		// Replace notes with approval; existing documents need approval added before the view can write it.
		class After extends schemaFactory.object("Task", {
			title: schemaFactory.string,
			isApproved: schemaFactory.optional(schemaFactory.boolean),
		}) {}
		const result = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: After }),
			toInitialSchema(Before),
		);
		assert.equal(result.canView, false);
		assert.equal(result.canUpgrade, true);
		assert.deepEqual(result.retainedUnknownOptionalFields, [
			{ nodeType: After.identifier, fieldKey: "notes" },
		]);
		assert.deepEqual(result.discrepancies, [
			{
				mismatch: "fieldKind",
				location: { nodeType: After.identifier, fieldKey: "isApproved" },
				view: "Optional",
				stored: "Forbidden",
			},
		]);
	});

	it("still reports retained fields when an incompatible declared field prevents upgrading", () => {
		class Before extends schemaFactory.object("Task", {
			title: schemaFactory.string,
			notes: schemaFactory.optional(schemaFactory.string),
		}) {}

		// Omit notes but also make an incompatible change to the required title field.
		class After extends schemaFactory.object("Task", {
			title: schemaFactory.number,
		}) {}
		const result = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: After }),
			toInitialSchema(Before),
		);
		assert.equal(result.canView, false);
		assert.equal(result.canUpgrade, false);
		assert.deepEqual(result.retainedUnknownOptionalFields, [
			{ nodeType: After.identifier, fieldKey: "notes" },
		]);
		assert.deepEqual(result.discrepancies, [
			{
				mismatch: "allowedTypes",
				location: { nodeType: After.identifier, fieldKey: "title" },
				view: [schemaFactory.number.identifier],
				stored: [schemaFactory.string.identifier],
			},
		]);
	});

	it("omits the property for declared fields, including renamed properties and preserved staged permissions", () => {
		class Before extends schemaFactory.object("Task", {
			comments: schemaFactory.optional(schemaFactory.string, { key: "notes" }),
			priority: schemaFactory.types([
				schemaFactory.number,
				schemaFactory.staged(schemaFactory.string),
			]),
			estimatedHours: schemaFactory.stagedOptional(schemaFactory.number),
		}) {}

		// Rename comments to its stored key and fully enable the staged permissions in the later version.
		class After extends schemaFactory.object("Task", {
			notes: schemaFactory.optional(schemaFactory.string),
			priority: [schemaFactory.number, schemaFactory.string],
			estimatedHours: schemaFactory.optional(schemaFactory.number),
		}) {}
		const result = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: Before }),
			toInitialSchema(After),
		);

		// The older view declares every stored field. Retaining types and optionality is not unknown-field retention.
		assert.equal(result.canUpgrade, true);
		assert.equal("retainedUnknownOptionalFields" in result, false);
	});

	for (const caseName of ["required field", "strict object"] as const) {
		it(`omits the property when an omitted field is ineligible for retention (${caseName})`, () => {
			class Before extends schemaFactory.object("Task", {
				title: schemaFactory.string,
				notes:
					caseName === "required field"
						? schemaFactory.required(schemaFactory.string)
						: schemaFactory.optional(schemaFactory.string),
			}) {}

			// Remove notes; either its required kind or the view's opt-out prevents unknown-field retention.
			class After extends schemaFactory.object(
				"Task",
				{ title: schemaFactory.string },
				{ allowUnknownOptionalFields: caseName !== "strict object" },
			) {}
			const result = checkSchemaCompatibility(
				new TreeViewConfigurationAlpha({ schema: After }),
				toInitialSchema(Before),
			);
			assert.equal(result.canUpgrade, false);
			assert.equal("retainedUnknownOptionalFields" in result, false);
		});
	}
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
