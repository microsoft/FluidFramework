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
	getSchemaIncompatibilityDetails,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	type SchemaUpgrade,
	type StagedUpgradeStatus,
	type ValidateRecursiveSchema,
	schemaStatics,
	StagedSchemaUpgradePolicy,
	TreeViewConfigurationAlpha,
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
	expected: Omit<ReturnType<typeof checkSchemaCompatibility>, "enabledUpgrades"> & {
		enabledUpgrades?: ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus>;
	},
) {
	const viewSchema = new TreeViewConfigurationAlpha({ schema: view });
	const compatibility = checkSchemaCompatibility(viewSchema, stored);
	assert.deepEqual(compatibility, {
		enabledUpgrades: new Map(),
		...expected,
	});

	// This does not include staged allowed types.
	const viewStored = toUpgradeSchema(view);

	// if it says upgradable, deriving a stored schema from the view schema gives one thats a superset of the old stored schema
	if (compatibility.canUpgrade) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, viewStored), true);
	}
	// if it is viewable, the old stored schema is also a superset of the new one.
	if (compatibility.canView) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, viewStored, stored), true);
	}
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
		assert.equal(
			getSchemaIncompatibilityDetails(schema, toUpgradeSchema(factory.number)),
			JSON.stringify({
				location: { nodeType: null, fieldKey: null },
				view: [factory.string.identifier],
				stored: [factory.number.identifier],
			}),
		);
	});

	it("formats a field kind discrepancy", () => {
		const schema = new TreeViewConfigurationAlpha({
			schema: factory.optional(factory.number),
		});
		assert.equal(
			getSchemaIncompatibilityDetails(
				schema,
				toUpgradeSchema(factory.required(factory.number)),
			),
			JSON.stringify({
				location: { nodeType: null, fieldKey: null },
				view: "Optional",
				stored: "Value",
			}),
		);
	});

	it("formats a value schema discrepancy", () => {
		const identifier = "valueSchema";
		const viewLeaf = new LeafNodeSchema(identifier, ValueSchema.Number);
		const storedLeaf = new LeafNodeSchema(identifier, ValueSchema.String);
		const schema = new TreeViewConfigurationAlpha({ schema: viewLeaf });
		assert.equal(
			getSchemaIncompatibilityDetails(schema, toUpgradeSchema(storedLeaf)),
			JSON.stringify({
				nodeType: identifier,
				view: "Number",
				stored: "String",
			}),
		);
	});

	it("formats a node kind discrepancy", () => {
		class ViewNode extends factory.object("nodeKind", {}) {}
		class StoredNode extends factory.map("nodeKind", []) {}
		const schema = new TreeViewConfigurationAlpha({ schema: ViewNode });
		assert.equal(
			getSchemaIncompatibilityDetails(schema, toUpgradeSchema(StoredNode)),
			JSON.stringify({
				nodeType: ViewNode.identifier,
				view: "Object",
				stored: "Map",
			}),
		);
	});
});

describe("checkSchemaCompatibility", () => {
	describe("function", () => {
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

			it("clients with staged schema allow viewing but not upgrading after upgrade", () => {
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
						canUpgrade: false,
						isEquivalent: false,
						enabledUpgrades: new Map([[upgrade, "enabled"]]),
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
					// enabledUpgrades may be incomplete when canView is false (early break).
					{
						canView: false,
						canUpgrade: false,
						isEquivalent: false,
						enabledUpgrades: new Map(),
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
