/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	type TreeStoredSchema,
	ValueSchema,
} from "../../../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { LeafNodeSchema } from "../../../simple-tree/leafNodeSchema.js";
import {
	checkSchemaCompatibility,
	allowUnused,
	getSchemaIncompatibilityDetails,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	type SchemaComparisonStatusAlpha,
	type SchemaUpgrade,
	type StagedUpgradeStatus,
	type ValidateRecursiveSchema,
	schemaStatics,
	StagedSchemaUpgradePolicy,
	TreeViewConfigurationAlpha,
	toUpgradeSchema,
	resolveStoredSchemaGenerationOptions,
	collectSchemaDiagnostics,
	getDiscrepanciesInAllowedContent,
} from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { SchemaFactoryAlpha } from "../../../simple-tree/index.js";
import { TestSchemaRepository } from "../../utils.js";

const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: storedEmptyFieldSchema,
};

const factory = new SchemaFactoryAlpha("");

/**
 * Checks compatibility expectations and the diagnostic contract for a schema pair.
 *
 * @param inputs - View schema and current stored schema to compare.
 * @param expected - Expected compatibility flags and enabled upgrades. Enabled upgrades default to an empty map.
 * @param stagedSchemaUpgrades - Staging policy passed to the compatibility check.
 * @returns The checked status for additional fixture-specific assertions.
 */
function expectCompatibility(
	inputs: { view: ImplicitFieldSchema; stored: TreeStoredSchema },
	expected: Omit<SchemaCompatibilityStatus, "canInitialize"> & {
		enabledUpgrades?: ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus>;
	},
	stagedSchemaUpgrades?: Parameters<typeof checkSchemaCompatibility>[2],
) {
	const { view, stored } = inputs;
	const viewSchema = new TreeViewConfigurationAlpha({ schema: view });
	const compatibility = checkSchemaCompatibility(viewSchema, stored, stagedSchemaUpgrades);
	const { discrepancies, canView, canUpgrade, isEquivalent, enabledUpgrades } = compatibility;
	const compatibilityWithoutDiscrepancies = {
		canView,
		canUpgrade,
		isEquivalent,
		enabledUpgrades,
	};
	assert.deepEqual(compatibilityWithoutDiscrepancies, {
		enabledUpgrades: new Map(),
		...expected,
	});
	assert.equal(discrepancies === undefined, compatibility.canView);

	// Reconstruct the effective target, including already-enabled upgrades when the policy retains them.
	const configuredPolicy = resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades);
	const target = toUpgradeSchema(viewSchema.root, {
		includeStaged: (upgrade) =>
			configuredPolicy.includeStaged(upgrade) ||
			(configuredPolicy.includeAlreadyEnabledUpgrades === true &&
				enabledUpgrades.has(upgrade)),
		includeStagedOptional: (upgrade) =>
			configuredPolicy.includeStagedOptional(upgrade) ||
			(configuredPolicy.includeAlreadyEnabledUpgrades === true &&
				enabledUpgrades.has(upgrade)),
	});
	// Compare raw blocker lists with the viewing and stored-schema rules, including successful checks.
	const raw = [...getDiscrepanciesInAllowedContent(viewSchema, stored)];
	const diagnostics = collectSchemaDiagnostics(viewSchema, stored, target, raw);
	assert.equal(diagnostics.view.length === 0, raw.length === 0);
	assert.equal(
		diagnostics.upgrade.length === 0,
		allowsRepoSuperset(defaultSchemaPolicy, stored, target),
	);
	assert.equal(
		diagnostics.equivalence.length === 0,
		raw.length === 0 &&
			allowsRepoSuperset(defaultSchemaPolicy, stored, target) &&
			allowsRepoSuperset(defaultSchemaPolicy, target, stored),
	);
	// Public subsets exist only for failed checks and reuse entries from the complete list.
	for (const [flag, property] of [
		["canView", "viewDiscrepancies"],
		["canUpgrade", "upgradeDiscrepancies"],
		["isEquivalent", "equivalenceDiscrepancies"],
	] as const) {
		const subset: unknown = Reflect.get(compatibility, property);
		if (compatibility[flag]) {
			assert.equal(property in compatibility, false);
		} else {
			assert(Array.isArray(subset) && subset.length > 0, `${property} must contain blockers`);
			for (const entry of subset) {
				assert(compatibility.allDiscrepancies.includes(entry));
			}
		}
	}
	// Diagnostic entries must survive JSON serialization without data loss or duplicate entries.
	assert.deepEqual(
		JSON.parse(JSON.stringify(compatibility.allDiscrepancies)),
		compatibility.allDiscrepancies,
	);
	assert.equal(
		new Set(compatibility.allDiscrepancies.map((entry) => JSON.stringify(entry))).size,
		compatibility.allDiscrepancies.length,
	);

	const viewStored = toUpgradeSchema(view, compatibility.enabledUpgrades.keys());

	// if it says upgradable, deriving a stored schema from the view schema gives one thats a superset of the old stored schema
	if (compatibility.canUpgrade) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, viewStored), true);
	}
	// if it is viewable, the old stored schema is also a superset of the new one.
	if (compatibility.canView) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, viewStored, stored), true);
	}
	return compatibility;
}

describe("getSchemaIncompatibilityDetails", () => {
	it("returns undefined for compatible schema", () => {
		const schema = new TreeViewConfigurationAlpha({ schema: factory.number });
		assert.equal(
			getSchemaIncompatibilityDetails(schema, toUpgradeSchema(factory.number)),
			undefined,
		);
	});

	it("formats an allowed types discrepancy", () => {
		const schema = new TreeViewConfigurationAlpha({ schema: factory.string });
		assert.deepEqual(
			getSchemaIncompatibilityDetails(schema, toUpgradeSchema(factory.number)),
			[
				{
					mismatch: "allowedTypes",
					location: "root",
					view: [factory.string.identifier],
					stored: [factory.number.identifier],
				},
			],
		);
	});

	it("formats all discrepancies", () => {
		const schema = new TreeViewConfigurationAlpha({
			schema: factory.optional(factory.string),
		});
		assert.deepEqual(
			getSchemaIncompatibilityDetails(
				schema,
				toUpgradeSchema(factory.required(factory.number)),
			),
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
		assert.deepEqual(getSchemaIncompatibilityDetails(schema, toUpgradeSchema(storedLeaf)), [
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
		assert.deepEqual(getSchemaIncompatibilityDetails(schema, toUpgradeSchema(StoredNode)), [
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

		assert.deepEqual(getSchemaIncompatibilityDetails(schema, toUpgradeSchema(StoredNode)), [
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

		assert.deepEqual(getSchemaIncompatibilityDetails(schema, toUpgradeSchema(StoredNode)), [
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

describe("checkSchemaCompatibility", () => {
	it("does not classify staged types as viewing blockers for an absent field", () => {
		const view = factory.objectAlpha("AbsentStagedField", {
			value: factory.types([factory.number, factory.staged(factory.string)]),
		});
		const stored = toUpgradeSchema(factory.object("AbsentStagedField", {}));
		const status = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: view }),
			stored,
		);
		assert(!status.canView);
		assert.deepEqual(
			status.viewDiscrepancies.map(({ mismatch }) => mismatch),
			["fieldKind"],
		);
		assert(
			status.allDiscrepancies.some(
				(entry) =>
					entry.mismatch === "allowedType" && entry.allowedType === factory.string.identifier,
			),
		);
	});

	it("produces nonempty subsets across node-kind and constructability transitions", () => {
		const identifier = "DiagnosticMatrix";
		const schemas = [
			factory.object(identifier, {}),
			factory.object(identifier, { value: factory.number }),
			factory.object(identifier, { value: factory.optional(factory.string) }),
			factory.object(identifier, { value: factory.required([]) }),
			factory.mapAlpha(identifier, factory.number),
			factory.mapAlpha(identifier, factory.string),
			factory.array(identifier, factory.number),
			factory.array(identifier, factory.string),
			new LeafNodeSchema(`.${identifier}`, ValueSchema.Number),
		];
		for (const view of schemas) {
			for (const original of schemas) {
				const stored = toUpgradeSchema(original);
				const { canView, canUpgrade, isEquivalent } = checkSchemaCompatibility(
					new TreeViewConfigurationAlpha({ schema: view }),
					stored,
				);
				expectCompatibility({ view, stored }, { canView, canUpgrade, isEquivalent });
			}
		}
	});

	it("orders reports independently of field, definition, and allowed-type insertion order", () => {
		function compare(reverse: boolean) {
			const fields = [
				['quoted"field', factory.optional(factory.number)],
				["other", factory.string],
			] as const;
			const view = factory.objectAlpha(
				"Ordered",
				Object.fromEntries(reverse ? [...fields].reverse() : fields),
				{ persistedMetadata: reverse ? { second: 2, first: 1 } : { first: 1, second: 2 } },
			);
			const storedFields = [
				['quoted"field', factory.string],
				["other", factory.number],
			] as const;
			const original = toUpgradeSchema(
				factory.objectAlpha(
					"Ordered",
					Object.fromEntries(reverse ? [...storedFields].reverse() : storedFields),
					{ persistedMetadata: { first: 0 } },
				),
			);
			const stored = {
				...original,
				nodeSchema: new Map(
					reverse ? [...original.nodeSchema].reverse() : original.nodeSchema,
				),
			};
			return checkSchemaCompatibility(
				new TreeViewConfigurationAlpha({
					schema: reverse ? [factory.boolean, view] : [view, factory.boolean],
				}),
				stored,
			);
		}
		const first = compare(false);
		const second = compare(true);
		assert.deepEqual(first.allDiscrepancies, second.allDiscrepancies);
		for (const property of [
			"viewDiscrepancies",
			"upgradeDiscrepancies",
			"equivalenceDiscrepancies",
		] as const) {
			assert.deepEqual(Reflect.get(first, property), Reflect.get(second, property));
		}
	});

	it("reports array element blockers at the implicit field", () => {
		const view = factory.array("ArrayDiagnostics", factory.number);
		const stored = factory.array("ArrayDiagnostics", factory.string);
		const status = expectCompatibility(
			{ view, stored: toUpgradeSchema(stored) },
			{ canView: false, canUpgrade: false, isEquivalent: false },
		);
		assert(!status.canView);
		assert.deepEqual(
			status.viewDiscrepancies.map(({ location }) => location),
			[
				{ nodeType: view.identifier, fieldKey: null },
				{ nodeType: view.identifier, fieldKey: null },
			],
		);
	});

	it("does not invent an implicit-field blocker for an accepted object-to-map upgrade", () => {
		const view = factory.map("ObjectToMapDiagnostics", factory.number);
		const stored = factory.object("ObjectToMapDiagnostics", { value: factory.number });
		const status = expectCompatibility(
			{ view, stored: toUpgradeSchema(stored) },
			{ canView: false, canUpgrade: true, isEquivalent: false },
		);
		assert(!status.isEquivalent);
		assert.deepEqual(
			status.equivalenceDiscrepancies.map(({ mismatch }) => mismatch),
			["nodeKind"],
		);
	});

	it("preserves empty-string object field locations in object-to-map failures", () => {
		const view = factory.map("EmptyObjectKeyDiagnostics", factory.number);
		const stored = factory.object("EmptyObjectKeyDiagnostics", { "": factory.string });
		const status = expectCompatibility(
			{ view, stored: toUpgradeSchema(stored) },
			{ canView: false, canUpgrade: false, isEquivalent: false },
		);
		assert(!status.canUpgrade);
		assert.deepEqual(
			status.upgradeDiscrepancies.map(({ location }) => location),
			[{ nodeType: view.identifier, fieldKey: "" }, { nodeType: factory.string.identifier }],
		);
	});

	it("reports explicit forbidden fields separately from absent fields", () => {
		const view = factory.object("ForbiddenDiagnostics", {});
		const original = toUpgradeSchema(view);
		const stored: TreeStoredSchema = {
			...original,
			nodeSchema: new Map([
				[
					brand(view.identifier),
					new ObjectNodeStoredSchema(new Map([[brand("value"), storedEmptyFieldSchema]])),
				],
			]),
		};
		const status = expectCompatibility(
			{ view, stored },
			{ canView: true, canUpgrade: true, isEquivalent: true },
		);
		assert.deepEqual(status.allDiscrepancies, [
			{
				mismatch: "fieldPresence",
				location: { nodeType: view.identifier, fieldKey: "value" },
				view: false,
				stored: true,
				target: false,
			},
		]);
	});

	it("narrows diagnostic subsets while retaining the base status contract", () => {
		const status: SchemaComparisonStatusAlpha = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: factory.string }),
			toUpgradeSchema(factory.number),
		);
		const base: Omit<SchemaCompatibilityStatus, "canInitialize"> = status;
		assert.equal(base.canView, false);
		// @ts-expect-error Subsets require narrowing their corresponding flag.
		allowUnused(status.viewDiscrepancies);
		// @ts-expect-error Subsets require narrowing their corresponding flag.
		allowUnused(status.upgradeDiscrepancies);
		// @ts-expect-error Subsets require narrowing their corresponding flag.
		allowUnused(status.equivalenceDiscrepancies);
		// @ts-expect-error Comparison helpers do not report initialization state.
		allowUnused(status.canInitialize);
		// @ts-expect-error The base API does not expose alpha diagnostics.
		allowUnused(base.allDiscrepancies);
		if (status.canView) {
			// @ts-expect-error Successful checks do not expose a blocker property.
			allowUnused(status.viewDiscrepancies);
		} else {
			assert(status.viewDiscrepancies.length > 0);
		}
		if (status.canUpgrade) {
			// @ts-expect-error Successful checks do not expose a blocker property.
			allowUnused(status.upgradeDiscrepancies);
		} else {
			assert(status.upgradeDiscrepancies.length > 0);
		}
		if (status.isEquivalent) {
			// @ts-expect-error Successful checks do not expose a blocker property.
			allowUnused(status.equivalenceDiscrepancies);
		} else {
			assert(status.equivalenceDiscrepancies.length > 0);
		}
	});

	it("reports persisted metadata but never traverses non-persisted metadata", () => {
		const metadata = {
			get custom(): never {
				throw new Error("Non-persisted metadata must not be read");
			},
			description: "Not persisted",
		};
		const storedNode = factory.objectAlpha(
			"Metadata",
			{ value: factory.number },
			{
				persistedMetadata: { label: "old", nested: { value: null } },
			},
		);
		const viewNode = factory.objectAlpha(
			"Metadata",
			{ value: factory.number },
			{
				metadata,
				persistedMetadata: { nested: { value: null }, label: "new" },
			},
		);
		const status = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: viewNode }),
			toUpgradeSchema(storedNode),
		);
		assert.equal(status.canView, true);
		assert.equal(status.canUpgrade, true);
		assert.equal(status.isEquivalent, true);
		assert.deepEqual(status.allDiscrepancies, [
			{
				mismatch: "persistedMetadata",
				location: { nodeType: viewNode.identifier },
				view: { label: "new", nested: { value: null } },
				stored: { label: "old", nested: { value: null } },
				target: { label: "new", nested: { value: null } },
			},
		]);
		assert.doesNotThrow(() => JSON.stringify(status));
	});

	it("keeps accepted staged differences out of blocker subsets", () => {
		const schema = new TreeViewConfigurationAlpha({
			schema: factory.types([factory.number, factory.staged(factory.string)]),
		});
		const status = checkSchemaCompatibility(schema, toUpgradeSchema(factory.number));
		assert.equal(status.isEquivalent, true);
		assert(status.allDiscrepancies.some((entry) => entry.mismatch === "stagedType"));
		assert.equal("viewDiscrepancies" in status, false);
		assert.equal("upgradeDiscrepancies" in status, false);
		assert.equal("equivalenceDiscrepancies" in status, false);
	});

	it("reports no alpha discrepancies for identical schemas", () => {
		const schema = new TreeViewConfigurationAlpha({ schema: factory.number });
		const status = checkSchemaCompatibility(schema, toUpgradeSchema(factory.number));
		assert.deepEqual(status.allDiscrepancies, []);
		assert.equal("viewDiscrepancies" in status, false);
		assert.equal("upgradeDiscrepancies" in status, false);
		assert.equal("equivalenceDiscrepancies" in status, false);
	});

	describe("function", () => {
		it("rejects incompatible definitions with the same identifier even when unreachable from the stored root", () => {
			// The same identifier refers to the same semantic type in both schemas.
			// Its definitions must be compatible, even if the stored root cannot reach the type.
			class ViewDeep extends factory.object("UnreachableDeep", {
				value: factory.number,
			}) {}
			class StoredDeep extends factory.object("UnreachableDeep", {
				value: factory.string,
			}) {}
			const viewConfiguration = new TreeViewConfigurationAlpha({
				schema: factory.types([factory.number, factory.staged(ViewDeep)]),
			});

			// Check that the view can access a tree whose root allows only numbers.
			const storedSchema = toUpgradeSchema(factory.number);
			const baseline = checkSchemaCompatibility(viewConfiguration, storedSchema);
			assert.equal(baseline.canView, true);
			assert.equal(baseline.discrepancies, undefined);

			// Add a different definition for the staged type. Keep the root schema unchanged.
			const withUnreachableDefinitions: TreeStoredSchema = {
				...storedSchema,
				nodeSchema: new Map([
					...storedSchema.nodeSchema,
					...toUpgradeSchema(StoredDeep).nodeSchema,
				]),
			};
			const { canView, discrepancies } = checkSchemaCompatibility(
				viewConfiguration,
				withUnreachableDefinitions,
			);

			// The definitions disagree on the value field.
			// This difference is expected to prevent the view schema from reading the document,
			// even though the incompatible view type definition is unreachable from the root of the stored schema.
			assert.equal(canView, false);
			assert.deepEqual(discrepancies, [
				{
					mismatch: "allowedTypes",
					location: {
						nodeType: ViewDeep.identifier,
						fieldKey: "value",
					},
					view: [factory.number.identifier],
					stored: [factory.string.identifier],
				},
			]);
		});

		it("includes non-blocking staged context only alongside a blocking discrepancy", () => {
			const viewConfiguration = new TreeViewConfigurationAlpha({
				schema: factory.types([factory.number, factory.staged(factory.string)]),
			});

			// The stored schema allows null, but the view does not. This difference prevents access.
			const incompatible = checkSchemaCompatibility(
				viewConfiguration,
				toUpgradeSchema([factory.number, factory.null]),
			);
			assert.equal(incompatible.canView, false);

			// The result also lists the staged string type, though this type does not prevent the view schema from viewing the document.
			assert.deepEqual(incompatible.discrepancies, [
				{
					mismatch: "allowedTypes",
					location: "root",
					view: [],
					stagedView: [factory.string.identifier],
					stored: [factory.null.identifier],
				},
			]);

			// Remove support for null from the stored schema.
			// The staged string type remains, but the view schema should now be able to view the document.
			const compatible = checkSchemaCompatibility(
				viewConfiguration,
				toUpgradeSchema(factory.number),
			);
			assert.equal(compatible.canView, true);
			assert.equal(compatible.discrepancies, undefined);
		});

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
				expectCompatibility(
					{ view: SomethingMap, stored: toUpgradeSchema(NeverMap) },
					expected,
				);
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

		describe("allows viewing but not upgrading when the view schema has opted into allowing the differences", () => {
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
					{ canView: true, canUpgrade: false, isEquivalent: false },
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
					expectIncomparability(
						factory.array(factory.number),
						factory.optional(factory.number),
					);
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

				// Note: the decision to not allow is policy. See
				// "allows viewing but not upgrading when the view schema has opted into allowing the differences" above.
				it("stored schema has additional optional fields which view schema did not allow", () => {
					class Point2D extends factory.objectAlpha("Point", {
						x: factory.number,
						y: factory.number,
					}) {}
					class Point3D extends factory.objectAlpha("Point", {
						x: factory.number,
						y: factory.number,
						z: factory.optional(factory.number),
					}) {}
					expectCompatibility({ view: Point2D, stored: toUpgradeSchema(Point3D) }, expected);
				});

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

		describe("with staged allowed types", () => {
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
					{
						...StagedSchemaUpgradePolicy.restrictive,
						includeAlreadyEnabledUpgrades: true,
					},
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
