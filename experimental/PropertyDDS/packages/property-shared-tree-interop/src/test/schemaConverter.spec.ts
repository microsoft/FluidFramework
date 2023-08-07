/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	brand,
	FieldKinds,
	ValueSchema,
	fail,
	Any,
	TreeSchemaIdentifier,
	FieldSchema,
	getPrimaryField,
	isPrimitive,
	FieldKey,
} from "@fluid-experimental/tree2";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import {
	convertPropertyToSharedTreeSchema as convertSchema,
	nodePropertyField,
	nodePropertySchema,
} from "../schemaConverter";
import mockPropertyDDSSchemas from "./mockPropertyDDSSchemas";

describe("schema converter", () => {
	describe("with built-in schemas only", () => {
		it(`has built-in primitive types and collections`, () => {
			const fullSchemaData = convertSchema(FieldKinds.optional, Any);
			[
				"Int8",
				"Int16",
				"Int32",
				"Int64",
				"Uint8",
				"Uint16",
				"Uint32",
				"Uint64",
				"Float32",
				"Float64",
				"Enum",
				"Bool",
				"String",
				"Reference",
			].forEach((typeName) => {
				const primitiveSchema = fullSchemaData.treeSchema.get(brand(typeName));
				assert(primitiveSchema !== undefined);
				assert(isPrimitive(primitiveSchema));
				assert(fullSchemaData.treeSchema.get(brand(`map<${typeName}>`)) !== undefined);
				assert(fullSchemaData.treeSchema.get(brand(`array<${typeName}>`)) !== undefined);
			});
		});

		["NodeProperty", "NamedNodeProperty", "NamedProperty", "RelationshipProperty"].forEach(
			(typeName) => {
				it(`has built-in ${typeName} node type and collections`, () => {
					const fullSchemaData = convertSchema(FieldKinds.optional, Any);

					const propertySchema = fullSchemaData.treeSchema.get(brand(typeName));
					assert(propertySchema !== undefined);
					if (typeName === "NamedProperty") {
						assert.equal(propertySchema.mapFields, undefined);
						const idFieldSchema =
							propertySchema.structFields.get(brand("guid")) ??
							fail("expected field");
						assert.deepEqual(idFieldSchema.kind, FieldKinds.value);
						assert.deepEqual(
							[...(idFieldSchema.types ?? fail("expected types"))],
							["String"],
						);
					} else {
						if (typeName === "NodeProperty") {
							assert(propertySchema.mapFields !== undefined);
							assert(propertySchema.mapFields.types === undefined);
							assert.deepEqual(propertySchema.mapFields.kind, FieldKinds.optional);
							assert.deepEqual([...propertySchema.structFields], []);
						} else {
							assert.deepEqual(
								propertySchema.structFields.get(brand(nodePropertyField))?.types,
								new Set([nodePropertySchema.name]),
							);
							assert.equal(propertySchema.mapFields, undefined);
							const idFieldSchema =
								propertySchema.structFields.get(brand("guid")) ??
								fail("expected field");
							assert.deepEqual(idFieldSchema.kind, FieldKinds.value);
							assert.deepEqual(
								[...(idFieldSchema.types ?? fail("expected types"))],
								["String"],
							);
							if (typeName === "RelationshipProperty") {
								const toFieldSchema =
									propertySchema.structFields.get(brand("to")) ??
									fail("expected field");
								assert.deepEqual(toFieldSchema.kind, FieldKinds.value);
								assert.deepEqual(
									[...(toFieldSchema.types ?? fail("expected types"))],
									["Reference"],
								);
							}
						}
					}
					assert.equal(propertySchema.leafValue, undefined);
					assert(fullSchemaData.treeSchema.get(brand(`map<${typeName}>`)) !== undefined);
					assert(
						fullSchemaData.treeSchema.get(brand(`array<${typeName}>`)) !== undefined,
					);
				});
			},
		);

		it("can use any type as root", () => {
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, Any);
				assert.deepEqual([...fullSchemaData.rootFieldSchema.allowedTypes], [Any]);
			}
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, new Set([Any]));
				assert.deepEqual([...fullSchemaData.rootFieldSchema.allowedTypes], [Any]);
			}
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["String", Any]));
				assert.deepEqual([...fullSchemaData.rootFieldSchema.allowedTypes], [Any]);
			}
		});

		it("can convert empty generic types to collections of Any", () => {
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["array<>"]));
				assert(fullSchemaData.treeSchema.get(brand("array<>")) === undefined);
				const primary = getPrimaryField(
					fullSchemaData.treeSchema.get(brand("array<Any>")) ??
						fail("expected tree schema"),
				);
				assert(primary !== undefined);
				assert.deepEqual(
					[...((primary.schema as FieldSchema).allowedTypes ?? fail("expected types"))],
					[Any],
				);
			}

			{
				const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["map<>"]));
				assert(fullSchemaData.treeSchema.get(brand("map<>")) === undefined);
				const anyMap =
					fullSchemaData.treeSchema.get(brand("map<Any>")) ??
					fail("expected tree schema");

				assert.deepEqual([...(anyMap.mapFields as FieldSchema).allowedTypes], [Any]);
			}
		});

		it(`throws at unknown typeid`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["Test:Optional-1.0.0"])),
				(e: Error) => validateAssertionError(e, `Unknown typeid "Test:Optional-1.0.0"`),
				"Expected exception was not thrown",
			);
		});

		it(`throws at unknown context`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["custom<Test:Optional-1.0.0>"])),
				(e: Error) =>
					validateAssertionError(
						e,
						`Unknown context "custom" in typeid "custom<Test:Optional-1.0.0>"`,
					),
				"Expected exception was not thrown",
			);
		});

		it(`throws when using "BaseProperty"`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["array<BaseProperty>"])),
				(e: Error) =>
					validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
				"Expected exception was not thrown",
			);
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["BaseProperty"])),
				(e: Error) =>
					validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
				"Expected exception was not thrown",
			);
		});
	});

	describe("with mocked schemas", () => {
		beforeAll(() => {
			PropertyFactory.register(Object.values(mockPropertyDDSSchemas));
		});

		it(`can create a non-primitive type w/o properties and not inheriting from NodeProperty`, () => {
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set(["Test:NeverType-1.0.0"]),
			);
			const neverTreeSchema = fullSchemaData.treeSchema.get(brand("Test:NeverType-1.0.0"));
			assert(neverTreeSchema !== undefined);
			assert.deepEqual([...(neverTreeSchema.structFields ?? fail("expected empty map"))], []);
			assert.deepEqual(neverTreeSchema.mapFields, undefined);
		});

		it(`does not support types with nested properties`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["Test:NestedProperties-1.0.0"])),
				(e: Error) =>
					validateAssertionError(
						e,
						`Nested properties are not supported yet (in property "withNestedProperties" of type "Test:NestedProperties-1.0.0")`,
					),
				"Expected exception was not thrown",
			);
		});

		it(`inherits from "NodeProperty"`, () => {
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set(["Test:Optional-1.0.0"]),
			);
			const nodeProperty = fullSchemaData.treeSchema.get(brand("NodeProperty"));
			const testOptional = fullSchemaData.treeSchema.get(brand("Test:Optional-1.0.0"));

			assert.equal(nodeProperty, nodePropertySchema);
			assert(testOptional !== undefined);
			assert.equal(testOptional.mapFields, undefined);

			const miscField = testOptional?.structFields.get(brand("misc"));
			assert(miscField?.types !== undefined);
			assert.deepEqual(
				miscField.types,
				new Set([
					nodePropertySchema.name,
					"NamedNodeProperty",
					"RelationshipProperty",
					"Test:Child-1.0.0",
					"Test:Optional-1.0.0",
				]),
			);

			const mapField = testOptional?.structFields.get(brand(nodePropertyField));
			assert(mapField?.types !== undefined);
			assert.deepEqual(mapField.types, new Set([nodePropertySchema.name]));
		});

		it(`can use "NodeProperty" as root`, () => {
			const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["NodeProperty"]));

			assert.deepEqual(fullSchemaData.rootFieldSchema.kind, FieldKinds.optional);
			assert.deepEqual(
				[...(fullSchemaData.rootFieldSchema.types ?? fail("expected root types"))],
				[
					"NodeProperty",
					"NamedNodeProperty",
					"RelationshipProperty",
					"Test:Child-1.0.0",
					"Test:Optional-1.0.0",
				],
			);

			// 60 types (all types, their arrays and maps)
			assert.equal(fullSchemaData.treeSchema.size, 60);
			const nodePropertySchemaLookedUp = fullSchemaData.treeSchema.get(brand("NodeProperty"));
			assert.equal(nodePropertySchemaLookedUp, nodePropertySchema);
		});

		it("can convert property with array context", () => {
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set(["Test:Optional-1.0.0"]),
			);
			const nodeSchema =
				fullSchemaData.treeSchema.get(brand("Test:Optional-1.0.0")) ??
				fail("missing schema");
			const arrayField =
				(nodeSchema.structFields.get(brand("childArray")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(arrayField.kind, FieldKinds.optional);
			const arrayTypeName: TreeSchemaIdentifier = brand("array<Test:Child-1.0.0>");
			assert.deepEqual([...(arrayField.types ?? fail("expected types"))], [arrayTypeName]);
			const arraySchema = fullSchemaData.treeSchema.get(arrayTypeName);
			assert(arraySchema !== undefined);
			assert.equal(arraySchema.leafValue, undefined);
			assert.equal(arraySchema.structFields.size, 1);
			const primary = getPrimaryField(arraySchema);
			assert(primary !== undefined);
			assert.deepEqual(primary.schema.kind, FieldKinds.sequence);
			assert.deepEqual(
				[...(primary.schema.types ?? fail("expected types"))],
				["Test:Child-1.0.0"],
			);
		});

		it("can convert property with map context", () => {
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set(["Test:Optional-1.0.0"]),
			);
			const nodeSchema =
				fullSchemaData.treeSchema.get(brand("Test:Optional-1.0.0")) ??
				fail("missing schema");
			const mapField =
				(nodeSchema.structFields.get(brand("childMap")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(mapField.kind, FieldKinds.optional);
			const mapTypeName: TreeSchemaIdentifier = brand("map<Test:Child-1.0.0>");
			assert.deepEqual([...(mapField.types ?? fail("expected types"))], [mapTypeName]);
			const mapSchema = fullSchemaData.treeSchema.get(mapTypeName);
			assert(mapSchema !== undefined);
			assert.deepEqual(mapSchema.mapFields?.kind, FieldKinds.optional);
			assert.deepEqual(
				[...(mapSchema.mapFields.types ?? fail("expected types"))],
				["Test:Child-1.0.0"],
			);
			assert.deepEqual([...mapSchema.structFields], []);
			assert.equal(mapSchema.leafValue, undefined);
		});

		it(`"set" context is not supported`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["set<Test:Optional-1.0.0>"])),
				(e: Error) => validateAssertionError(e, `Context "set" is not supported yet`),
				"Expected exception was not thrown",
			);
		});

		it(`can convert property w/o typeid into field of type Any`, () => {
			const extraTypeName: TreeSchemaIdentifier = brand("Test:IndependentType-1.0.0");
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				Any,
				new Set([extraTypeName]),
			);
			const extraTypeSchema =
				fullSchemaData.treeSchema.get(extraTypeName) ?? fail("expected tree schema");
			const anyField =
				(extraTypeSchema?.structFields.get(brand("any")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(anyField?.kind, FieldKinds.optional);
			assert(anyField.types === undefined);
			assert.deepEqual([...anyField.allowedTypes], [Any]);

			const mapOfAnyField =
				(extraTypeSchema?.structFields.get(brand("mapOfAny")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual([...(mapOfAnyField.types ?? fail("expected types"))], ["map<Any>"]);

			const arrayOfAnyField =
				(extraTypeSchema?.structFields.get(brand("arrayOfAny")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(
				[...(arrayOfAnyField.types ?? fail("expected types"))],
				["array<Any>"],
			);
		});

		it(`can use independent and 'Any' types as allowed root types`, () => {
			// note: "Test:IndependentType-1.0.0" does not belong to any inheritance chain i.e.
			// it is not included into the full schema automatically
			const extraTypeName: TreeSchemaIdentifier = brand("Test:IndependentType-1.0.0");
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set([extraTypeName, Any]),
			);
			assert(fullSchemaData.treeSchema.get(extraTypeName) !== undefined);
			assert(fullSchemaData.rootFieldSchema.types === undefined);
		});

		it(`can use extra schemas`, () => {
			// note: "Test:IndependentType-1.0.0" does not belong to any inheritance chain i.e.
			// it is not included into the full schema automatically
			const extraTypeName: TreeSchemaIdentifier = brand("Test:IndependentType-1.0.0");
			// provided no extra types
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, Any);
				assert(fullSchemaData.treeSchema.get(extraTypeName) === undefined);
			}
			// with extra types
			{
				const fullSchemaData = convertSchema(
					FieldKinds.optional,
					Any,
					new Set([extraTypeName]),
				);
				assert(fullSchemaData.treeSchema.get(extraTypeName) !== undefined);
			}
		});

		it(`can use enums`, () => {
			const enumTypeName: TreeSchemaIdentifier = brand(`Test:Optional-1.0.0`);
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				Any,
				new Set([`enum<${enumTypeName}>`]),
			);
			const enumSchema = fullSchemaData.treeSchema.get(brand(`enum<${enumTypeName}>`));
			assert(enumSchema && isPrimitive(enumSchema));
			assert.equal(enumSchema.leafValue, ValueSchema.Number);

			const arrayOfEnums = fullSchemaData.treeSchema.get(
				brand(`array<enum<${enumTypeName}>>`),
			);
			assert(arrayOfEnums);
			const primary = getPrimaryField(arrayOfEnums);
			assert(primary);
			assert.deepEqual([...(primary.schema as FieldSchema).allowedTypes][0], enumSchema);

			const mapOfEnums = fullSchemaData.treeSchema.get(brand(`map<enum<${enumTypeName}>>`));
			assert(mapOfEnums);
			assert.deepEqual(
				[...(mapOfEnums.mapFields as FieldSchema).allowedTypes][0],
				enumSchema,
			);
		});

		it(`can use recursive schemas`, () => {
			const parentTypeName: TreeSchemaIdentifier = brand("Test:Optional-1.0.0");
			const childTypeName: TreeSchemaIdentifier = brand("Test:Child-1.0.0");
			const childFieldKey: FieldKey = brand("child");
			const parentFieldKey: FieldKey = brand("parent");

			const fullSchemaData = convertSchema(FieldKinds.optional, new Set([parentTypeName]));

			assert.deepEqual(
				[...(fullSchemaData.rootFieldSchema.types ?? fail("expected types"))],
				[parentTypeName, childTypeName],
			);
			const parentSchema =
				fullSchemaData.treeSchema.get(parentTypeName) ?? fail("expected tree schema");
			const childFieldSchema =
				parentSchema.structFields.get(childFieldKey) ?? fail("expected field schema");
			assert.deepEqual(
				[...(childFieldSchema.types ?? fail("expected types"))],
				[childTypeName],
			);

			const childSchema =
				fullSchemaData.treeSchema.get(childTypeName) ?? fail("expected tree schema");
			const parentFieldSchema =
				childSchema.structFields.get(parentFieldKey) ?? fail("expected field schema");
			assert.deepEqual(
				[...(parentFieldSchema.types ?? fail("expected types"))],
				[parentTypeName, childTypeName],
			);
			const childOfChildFieldSchema =
				childSchema.structFields.get(childFieldKey) ?? fail("expected field schema");
			assert.deepEqual(childOfChildFieldSchema, childFieldSchema);
		});

		it(`throws when using "BaseProperty" in properties`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, Any, new Set(["Test:BaseProperty-1.0.0"])),
				(e: Error) =>
					validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
				"Expected exception was not thrown",
			);

			assert.throws(
				() =>
					convertSchema(
						FieldKinds.optional,
						Any,
						new Set(["Test:BasePropertyCollection-1.0.0"]),
					),
				(e: Error) =>
					validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
				"Expected exception was not thrown",
			);
		});
	});
});
