import { strict as assert } from "assert";
import {
	storedEmptyFieldSchema,
	type Adapters,
	type TreeStoredSchema,
} from "../../core/index.js";
import { defaultSchemaPolicy } from "../../feature-libraries/index.js";
import {
	SchemaFactory,
	toStoredSchema,
	ViewSchema,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
} from "../../simple-tree/index.js";

const noAdapters: Adapters = {};
const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: storedEmptyFieldSchema,
};

const factory = new SchemaFactory("");

function expectCompatibility(
	{ view, stored }: { view: ImplicitFieldSchema; stored: TreeStoredSchema },
	expected: ReturnType<ViewSchema["checkCompatibility"]>,
) {
	const viewSchema = new ViewSchema(defaultSchemaPolicy, noAdapters, view);
	const compatibility = viewSchema.checkCompatibility(stored);
	assert.deepEqual(compatibility, expected);
}

describe("viewSchema", () => {
	describe(".checkCompatibility", () => {
		it("normalizes never trees to forbidden", () => {
			class NeverObject extends factory.objectRecursive("NeverObject", {
				foo: factory.requiredRecursive([() => NeverObject]),
			}) {}

			const neverField = factory.required([]);
			expectCompatibility(
				{ view: NeverObject, stored: emptySchema },
				{ canView: true, canUpgrade: true, isEquivalent: true },
			);

			expectCompatibility(
				{ view: neverField, stored: emptySchema },
				{ canView: true, canUpgrade: true, isEquivalent: true },
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
					factory.object("foo", { x: factory.number, y: factory.number, baz: factory.string }),
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
				class StricterObject extends factory.object("TestNode", {
					x: factory.number,
				}) {}
				class FlexibleObject extends factory.object("TestNode", {
					x: [factory.number, factory.string],
				}) {}
				expectCompatibility(
					{ view: FlexibleObject, stored: toStoredSchema(StricterObject) },
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
				expectCompatibility({ view: Point3D, stored: toStoredSchema(Point2D) }, expected);
			});

			describe("due to field kind relaxation", () => {
				it("view: required field ⊃ stored: identifier field", () => {
					// Identifiers are strings, so they should only be relaxable to fields which support strings.
					expectCompatibility(
						{
							view: factory.required(factory.string),
							stored: toStoredSchema(factory.identifier),
						},
						expected,
					);
					expectCompatibility(
						{
							view: factory.required(factory.number),
							stored: toStoredSchema(factory.identifier),
						},
						{ canView: false, canUpgrade: false, isEquivalent: false },
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
				// Note: despite optional fields being relaxable to sequence fields in the stored schema representation,
				// this is not possible to recreate using the current public API due to differences in array and sequence design
			});
		});

		describe("allows viewing but not upgrading when the view schema has opted into allowing the differences", () => {
			// TODO:AB#8121: Enable this test
			it.skip("due to additional optional fields in the stored schema", () => {
				class Point2D extends factory.object("Point", {
					x: factory.number,
					y: factory.number,
				}) {}
				class Point3D extends factory.object("Point", {
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

				describe("due to a field kind difference", () => {
					it("view: identifier vs stored: forbidden", () => {
						expectIncomparability(factory.identifier, factory.required([]));
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
			});

			describe("when the view schema allows a subset of the stored schema's documents but in ways that misalign with allowed viewing policies", () => {
				const expected: Omit<SchemaCompatibilityStatus, "canInitialize"> = {
					canView: false,
					canUpgrade: false,
					isEquivalent: false,
				};
				// TODO:AB#8121: This test should be updated with "...that the view schema did not declare as acceptable"
				// potentially testing multiple variants (e.g. if we add APIs to allow apps to opt in to additional optional fields being OK at the
				// schema repository level as well as at the object schema declaration level, we would want both cases here)
				it("stored schema has additional optional fields", () => {
					class Point2D extends factory.object("Point", {
						x: factory.number,
						y: factory.number,
					}) {}
					class Point3D extends factory.object("Point", {
						x: factory.number,
						y: factory.number,
						z: factory.optional(factory.number),
					}) {}
					expectCompatibility({ view: Point2D, stored: toStoredSchema(Point3D) }, expected);
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
						class IncompatibleObject1 extends factory.object("TestNode", {
							x: factory.number,
						}) {}
						class IncompatibleObject2 extends factory.object("TestNode", {
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
	});
});
