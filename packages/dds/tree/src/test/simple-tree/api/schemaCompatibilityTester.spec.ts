/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	EmptyKey,
	storedEmptyFieldSchema,
	type TreeStoredSchema,
} from "../../../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../../feature-libraries/index.js";
import {
	toStoredSchema,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	TreeViewConfigurationAlpha,
} from "../../../simple-tree/index.js";
import { SchemaFactoryAlpha } from "../../../simple-tree/index.js";

// eslint-disable-next-line import/no-internal-modules
import { SchemaCompatibilityTester } from "../../../simple-tree/api/schemaCompatibilityTester.js";

const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: storedEmptyFieldSchema,
};

const factory = new SchemaFactoryAlpha("");

function expectCompatibility(
	{ view, stored }: { view: ImplicitFieldSchema; stored: TreeStoredSchema },
	expected: ReturnType<SchemaCompatibilityTester["checkCompatibility"]>,
) {
	const viewSchema = new SchemaCompatibilityTester(
		new TreeViewConfigurationAlpha({ schema: view }),
	);
	const compatibility = viewSchema.checkCompatibility(stored);
	assert.deepEqual(compatibility, expected);

	// This does not include staged allowed types.
	const viewStored = toStoredSchema(view);

	// if it says upgradable, deriving a stored schema from the view schema gives one thats a superset of the old stored schema
	if (compatibility.canUpgrade) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, viewStored), true);
	}
	// if it is viewable, the old stored schema is also a superset of the new one.
	if (compatibility.canView) {
		assert.equal(allowsRepoSuperset(defaultSchemaPolicy, viewStored, stored), true);
	}
}

describe("SchemaCompatibilityTester", () => {
	describe(".checkCompatibility", () => {
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
					{ view, stored: toStoredSchema(view) },
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
					{ view: SomethingMap, stored: toStoredSchema(NeverMap) },
					expected,
				);
			});

			// Add allowed types to object node
			it("view: FlexibleObject ⊃ stored: StricterObject", () => {
				class StricterObject extends factory.objectAlpha("TestNode", {
					x: factory.number,
				}) {}
				class FlexibleObject extends factory.objectAlpha("TestNode", {
					x: [factory.number, factory.string],
				}) {}
				expectCompatibility(
					{ view: FlexibleObject, stored: toStoredSchema(StricterObject) },
					expected,
				);
			});
			// Add optional field to existing schema
			it("view: optional 3d Point ⊃ stored: 2d Point", () => {
				class Point2D extends factory.objectAlpha("Point", {
					x: factory.number,
					y: factory.number,
				}) {}
				class Point3D extends factory.objectAlpha("Point", {
					x: factory.number,
					y: factory.number,
					z: factory.optional(factory.number),
				}) {}
				expectCompatibility({ view: Point3D, stored: toStoredSchema(Point2D) }, expected);
			});

			describe("due to field kind relaxation", () => {
				it("stored identifier", () => {
					// Identifiers are strings, so they should only be relaxable to fields which support strings.
					expectCompatibility(
						{
							view: factory.string,
							stored: toStoredSchema(factory.identifier),
						},
						expected,
					);
					expectCompatibility(
						{
							view: factory.number,
							stored: toStoredSchema(factory.identifier),
						},
						{ canView: false, canUpgrade: false, isEquivalent: false },
					);

					expectCompatibility(
						{
							view: factory.optional(factory.string),
							stored: toStoredSchema(factory.identifier),
						},
						expected,
					);
				});
				it("view: optional field ⊃ stored: required field", () => {
					expectCompatibility(
						{
							view: factory.optional(factory.number),
							stored: toStoredSchema(factory.required(factory.number)),
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
							stored: toStoredSchema(factory.string),
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
							stored: toStoredSchema(factory.object("x", { [EmptyKey]: factory.string })),
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
							stored: toStoredSchema(
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
							stored: toStoredSchema(factory.object("x", { [EmptyKey]: factory.identifier })),
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
					stored: toStoredSchema(
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
				class Point2D extends factory.objectAlpha(
					"Point",
					{
						x: factory.number,
						y: factory.number,
					},
					{ allowUnknownOptionalFields: true },
				) {}
				class Point3D extends factory.objectAlpha("Point", {
					x: factory.number,
					y: factory.number,
					z: factory.optional(factory.number),
				}) {}
				expectCompatibility(
					{ view: Point2D, stored: toStoredSchema(Point3D) },
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
					expectCompatibility({ view: a, stored: toStoredSchema(b) }, expected);
					expectCompatibility({ view: b, stored: toStoredSchema(a) }, expected);
				}

				describe("due to an allowed type difference", () => {
					it("at the root", () => {
						expectIncomparability(factory.number, factory.string);
					});

					it("in an object", () => {
						class IncompatibleObject1 extends factory.objectAlpha("TestNode", {
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
					class Point2D extends factory.objectAlpha("Point", {
						x: factory.number,
						y: factory.number,
					}) {}
					class Point3D extends factory.objectAlpha("Point", {
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
					expectCompatibility({ view: Point2D, stored: toStoredSchema(Point3D) }, expected);
				});

				// This case demonstrates some need for care when allowing view schema to open documents with more flexible stored schema
				it("stored schema has optional fields where view schema expects content", () => {
					expectCompatibility(
						{
							view: factory.identifier,
							stored: toStoredSchema(factory.optional(factory.string)),
						},
						expected,
					);
					expectCompatibility(
						{ view: factory.number, stored: toStoredSchema(factory.optional(factory.number)) },
						expected,
					);
				});

				describe("stored schema has additional unadapted allowed types", () => {
					it("at the root", () => {
						expectCompatibility(
							{
								view: factory.number,
								stored: toStoredSchema(factory.required([factory.number, factory.string])),
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
							{ view: IncompatibleObject1, stored: toStoredSchema(IncompatibleObject2) },
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
							{ view: IncompatibleMap1, stored: toStoredSchema(IncompatibleMap2) },
							expected,
						);
					});
				});
			});
		});

		describe("with staged allowed types", () => {
			it("adding a staged allowed type does not break compatibility", () => {
				class Compatible1 extends factory.objectAlpha("MyType", {
					foo: SchemaFactoryAlpha.number,
				}) {}

				class Compatible2 extends factory.objectAlpha("MyType", {
					foo: [
						SchemaFactoryAlpha.number,
						SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
					],
				}) {}

				expectCompatibility(
					{ view: Compatible2, stored: toStoredSchema(Compatible1) },
					{ canView: true, canUpgrade: true, isEquivalent: true },
				);
			});

			it("can upgrade from staged to allowed", () => {
				class Compatible1 extends factory.objectAlpha("MyType", {
					foo: [
						SchemaFactoryAlpha.number,
						SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
					],
				}) {}

				class Compatible2 extends factory.objectAlpha("MyType", {
					foo: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.string],
				}) {}

				expectCompatibility(
					{ view: Compatible2, stored: toStoredSchema(Compatible1) },
					{ canView: false, canUpgrade: true, isEquivalent: false },
				);
			});

			it("clients with staged schema allow viewing but not upgrading after upgrade", () => {
				class Compatible1 extends factory.objectAlpha("MyType", {
					foo: [
						SchemaFactoryAlpha.number,
						SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
					],
				}) {}

				class Compatible2 extends factory.objectAlpha("MyType", {
					foo: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.string],
				}) {}

				expectCompatibility(
					{ view: Compatible1, stored: toStoredSchema(Compatible2) },
					{ canView: true, canUpgrade: false, isEquivalent: false },
				);
			});

			it("staged schema which mismatches stored can not view", () => {
				class Compatible1 extends factory.objectAlpha("MyType", {
					foo: [
						SchemaFactoryAlpha.number,
						SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
					],
				}) {}

				class Compatible2 extends factory.objectAlpha("MyType", {
					foo: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.null],
				}) {}

				expectCompatibility(
					{ view: Compatible1, stored: toStoredSchema(Compatible2) },
					{ canView: false, canUpgrade: false, isEquivalent: false },
				);
			});

			it("staged schema which deeply mismatches stored can not view", () => {
				class Deep1 extends factory.objectAlpha("Deep", {
					foo: SchemaFactoryAlpha.number,
				}) {}

				class Deep2 extends factory.objectAlpha("Deep", {
					bar: SchemaFactoryAlpha.number,
				}) {}

				class Compatible1 extends factory.objectAlpha("MyType", {
					foo: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.staged(Deep1)],
				}) {}

				class Compatible2 extends factory.objectAlpha("MyType", {
					foo: [SchemaFactoryAlpha.number, Deep2],
				}) {}

				expectCompatibility(
					{ view: Compatible1, stored: toStoredSchema(Compatible2) },
					{ canView: false, canUpgrade: false, isEquivalent: false },
				);
			});
		});
	});
});
