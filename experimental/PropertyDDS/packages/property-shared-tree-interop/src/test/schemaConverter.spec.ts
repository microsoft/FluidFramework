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
	lookupTreeSchema,
	isPrimitive,
	LocalFieldKey,
} from "@fluid-experimental/tree2";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { convertPropertyToSharedTreeSchema as convertSchema } from "../schemaConverter";
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

		it(`has built-in node types and collections`, () => {
			const fullSchemaData = convertSchema(FieldKinds.optional, Any);
			["NodeProperty", "NamedNodeProperty", "NamedProperty", "RelationshipProperty"].forEach(
				(typeName) => {
					const propertySchema = fullSchemaData.treeSchema.get(brand(typeName));
					assert(propertySchema !== undefined);
					if (typeName === "NamedProperty") {
						assert(propertySchema.extraLocalFields.types !== undefined);
						assert.equal(propertySchema.extraLocalFields.types.size, 0);
						assert.deepEqual(
							propertySchema.extraLocalFields.kind,
							FieldKinds.forbidden,
						);
						const idFieldSchema =
							propertySchema.localFields.get(brand("guid")) ?? fail("expected field");
						assert.deepEqual(idFieldSchema.kind, FieldKinds.value);
						assert.deepEqual(
							[...(idFieldSchema.types ?? fail("expected types"))],
							["String"],
						);
					} else {
						assert(propertySchema.extraLocalFields.types === undefined);
						assert.deepEqual(propertySchema.extraLocalFields.kind, FieldKinds.optional);
						if (typeName === "NodeProperty") {
							assert.deepEqual([...propertySchema.localFields], []);
						} else {
							const idFieldSchema =
								propertySchema.localFields.get(brand("guid")) ??
								fail("expected field");
							assert.deepEqual(idFieldSchema.kind, FieldKinds.value);
							assert.deepEqual(
								[...(idFieldSchema.types ?? fail("expected types"))],
								["String"],
							);
							if (typeName === "RelationshipProperty") {
								const toFieldSchema =
									propertySchema.localFields.get(brand("to")) ??
									fail("expected field");
								assert.deepEqual(toFieldSchema.kind, FieldKinds.value);
								assert.deepEqual(
									[...(toFieldSchema.types ?? fail("expected types"))],
									["Reference"],
								);
							}
						}
					}
					assert.deepEqual([...propertySchema.globalFields], []);
					assert.equal(propertySchema.extraGlobalFields, false);
					assert.equal(propertySchema.value, ValueSchema.Nothing);
					assert(fullSchemaData.treeSchema.get(brand(`map<${typeName}>`)) !== undefined);
					assert(
						fullSchemaData.treeSchema.get(brand(`array<${typeName}>`)) !== undefined,
					);
				},
			);
		});

		it("can use any type as root", () => {
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, Any);
				assert.deepEqual([...fullSchemaData.root.schema.allowedTypes], [Any]);
			}
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, new Set([Any]));
				assert.deepEqual([...fullSchemaData.root.schema.allowedTypes], [Any]);
			}
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["String", Any]));
				assert.deepEqual([...fullSchemaData.root.schema.allowedTypes], [Any]);
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

				assert.deepEqual([...(anyMap.extraLocalFields as FieldSchema).allowedTypes], [Any]);
			}
		});

		it(`throws at unknown typeid`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["Test:Optional-1.0.0"])),
				(e) => validateAssertionError(e, `Unknown typeid "Test:Optional-1.0.0"`),
				"Expected exception was not thrown",
			);
		});

		it(`throws at unknown context`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["custom<Test:Optional-1.0.0>"])),
				(e) =>
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
				(e) => validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
				"Expected exception was not thrown",
			);
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["BaseProperty"])),
				(e) => validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
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
			assert.deepEqual([...(neverTreeSchema.localFields ?? fail("expected empty map"))], []);
			assert.deepEqual(neverTreeSchema.extraLocalFields.kind, FieldKinds.forbidden);
			assert.deepEqual(
				[...(neverTreeSchema.extraLocalFields.types ?? fail("expected empty set"))],
				[],
			);
			assert.deepEqual([...(neverTreeSchema.globalFields ?? fail("expected empty set"))], []);
			assert.equal(neverTreeSchema.extraGlobalFields, false);
		});

		it(`does not support types with nested properties`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["Test:NestedProperties-1.0.0"])),
				(e) =>
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
			const nodeProperty = lookupTreeSchema(fullSchemaData, brand("NodeProperty"));
			const testOptional = lookupTreeSchema(fullSchemaData, brand("Test:Optional-1.0.0"));
			assert.deepEqual(testOptional?.extraLocalFields, nodeProperty?.extraLocalFields);
			const miscField = testOptional?.localFields.get(brand("misc"));
			assert(miscField?.types !== undefined);
			assert.deepEqual(
				[...miscField.types],
				[
					"NodeProperty",
					"NamedNodeProperty",
					"RelationshipProperty",
					"Test:Child-1.0.0",
					"Test:Optional-1.0.0",
				],
			);
		});

		it(`can use "NodeProperty" as root`, () => {
			const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["NodeProperty"]));

			assert.deepEqual(fullSchemaData.root.kind, FieldKinds.optional);
			assert.deepEqual(
				[...(fullSchemaData.root.types ?? fail("expected root types"))],
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
			const nodePropertySchema = lookupTreeSchema(fullSchemaData, brand("NodeProperty"));
			assert.deepEqual(nodePropertySchema.extraLocalFields.kind, FieldKinds.optional);
			assert.deepEqual([...nodePropertySchema.localFields], []);
			assert.deepEqual([...nodePropertySchema.globalFields], []);
			assert.equal(nodePropertySchema.extraGlobalFields, false);
			assert.equal(nodePropertySchema.value, ValueSchema.Nothing);
		});

		it("can convert property with array context", () => {
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set(["Test:Optional-1.0.0"]),
			);
			const nodeSchema = lookupTreeSchema(fullSchemaData, brand("Test:Optional-1.0.0"));
			const arrayField =
				(nodeSchema.localFields.get(brand("childArray")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(arrayField.kind, FieldKinds.optional);
			const arrayTypeName: TreeSchemaIdentifier = brand("array<Test:Child-1.0.0>");
			assert.deepEqual([...(arrayField.types ?? fail("expected types"))], [arrayTypeName]);
			const arraySchema = fullSchemaData.treeSchema.get(arrayTypeName);
			assert(arraySchema !== undefined);
			assert.deepEqual([...arraySchema.globalFields], []);
			assert.equal(arraySchema.extraGlobalFields, false);
			assert.equal(arraySchema.value, ValueSchema.Nothing);
			assert.equal(arraySchema.localFields.size, 1);
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
			const nodeSchema = lookupTreeSchema(fullSchemaData, brand("Test:Optional-1.0.0"));
			const mapField =
				(nodeSchema.localFields.get(brand("childMap")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(mapField.kind, FieldKinds.optional);
			const mapTypeName: TreeSchemaIdentifier = brand("map<Test:Child-1.0.0>");
			assert.deepEqual([...(mapField.types ?? fail("expected types"))], [mapTypeName]);
			const mapSchema = fullSchemaData.treeSchema.get(mapTypeName);
			assert(mapSchema !== undefined);
			assert.deepEqual(mapSchema.extraLocalFields.kind, FieldKinds.optional);
			assert.deepEqual(
				[...(mapSchema.extraLocalFields.types ?? fail("expected types"))],
				["Test:Child-1.0.0"],
			);
			assert.deepEqual([...mapSchema.localFields], []);
			assert.deepEqual([...mapSchema.globalFields], []);
			assert.equal(mapSchema.extraGlobalFields, false);
			assert.equal(mapSchema.value, ValueSchema.Nothing);
		});

		it(`"set" context is not supported`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["set<Test:Optional-1.0.0>"])),
				(e) => validateAssertionError(e, `Context "set" is not supported yet`),
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
				(extraTypeSchema?.localFields.get(brand("any")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(anyField?.kind, FieldKinds.optional);
			assert(anyField.types === undefined);
			assert.deepEqual([...anyField.allowedTypes], [Any]);

			const mapOfAnyField =
				(extraTypeSchema?.localFields.get(brand("mapOfAny")) as FieldSchema) ??
				fail("expected field schema");
			assert.deepEqual([...(mapOfAnyField.types ?? fail("expected types"))], ["map<Any>"]);

			const arrayOfAnyField =
				(extraTypeSchema?.localFields.get(brand("arrayOfAny")) as FieldSchema) ??
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
			assert(fullSchemaData.root.types === undefined);
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
			assert.equal(enumSchema.value, ValueSchema.Number);

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
				[...(mapOfEnums.extraLocalFields as FieldSchema).allowedTypes][0],
				enumSchema,
			);
		});

		it(`can use recursive schemas`, () => {
			const parentTypeName: TreeSchemaIdentifier = brand("Test:Optional-1.0.0");
			const childTypeName: TreeSchemaIdentifier = brand("Test:Child-1.0.0");
			const childFieldKey: LocalFieldKey = brand("child");
			const parentFieldKey: LocalFieldKey = brand("parent");

			const fullSchemaData = convertSchema(FieldKinds.optional, new Set([parentTypeName]));

			assert.deepEqual(
				[...(fullSchemaData.root.types ?? fail("expected types"))],
				[parentTypeName, childTypeName],
			);
			const parentSchema =
				fullSchemaData.treeSchema.get(parentTypeName) ?? fail("expected tree schema");
			const childFieldSchema =
				parentSchema.localFields.get(childFieldKey) ?? fail("expected field schema");
			assert.deepEqual(
				[...(childFieldSchema.types ?? fail("expected types"))],
				[childTypeName],
			);

			const childSchema =
				fullSchemaData.treeSchema.get(childTypeName) ?? fail("expected tree schema");
			const parentFieldSchema =
				childSchema.localFields.get(parentFieldKey) ?? fail("expected field schema");
			assert.deepEqual(
				[...(parentFieldSchema.types ?? fail("expected types"))],
				[parentTypeName, childTypeName],
			);
			const childOfChildFieldSchema =
				childSchema.localFields.get(childFieldKey) ?? fail("expected field schema");
			assert.deepEqual(childOfChildFieldSchema, childFieldSchema);
		});

		it(`throws when using "BaseProperty" in properties`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, Any, new Set(["Test:BaseProperty-1.0.0"])),
				(e) => validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
				"Expected exception was not thrown",
			);

			assert.throws(
				() =>
					convertSchema(
						FieldKinds.optional,
						Any,
						new Set(["Test:BasePropertyCollection-1.0.0"]),
					),
				(e) => validateAssertionError(e, `"BaseProperty" shall not be used in schemas.`),
				"Expected exception was not thrown",
			);
		});
	});
});
