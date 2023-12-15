/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	brand,
	FieldKinds,
	fail,
	Any,
	TreeNodeSchemaIdentifier,
	TreeFieldSchema,
	FieldKey,
	leaf,
	schemaIsFieldNode,
	schemaIsLeaf,
	ObjectNodeSchema,
	MapNodeSchema,
	LeafNodeSchema,
	FieldNodeSchema,
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
			// Float64
			assert(fullSchemaData.nodeSchema.get(leaf.number.name) === leaf.number);
			// String
			assert(fullSchemaData.nodeSchema.get(leaf.string.name) === leaf.string);
			// Bool
			assert(fullSchemaData.nodeSchema.get(leaf.boolean.name) === leaf.boolean);
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
				if (!new Set(["Float64", "Bool", "String"]).has(typeName)) {
					const primitiveSchema = fullSchemaData.nodeSchema.get(
						brand(`converted.${typeName}`),
					);
					assert(primitiveSchema !== undefined);
					assert(schemaIsFieldNode(primitiveSchema));

					const innerSchema =
						primitiveSchema.info.monomorphicChildType ?? fail("missing schema");
					assert(schemaIsLeaf(innerSchema));
				}
				assert(
					fullSchemaData.nodeSchema.get(brand(`converted.map<${typeName}>`)) !==
						undefined,
				);
				assert(
					fullSchemaData.nodeSchema.get(brand(`converted.array<${typeName}>`)) !==
						undefined,
				);
			});
		});

		[
			nodePropertySchema.name,
			"converted.NamedNodeProperty",
			"converted.NamedProperty",
			"converted.RelationshipProperty",
		].forEach((typeName) => {
			it(`has built-in ${typeName} node type and collections`, () => {
				const fullSchemaData = convertSchema(FieldKinds.optional, Any);

				const propertySchema = fullSchemaData.nodeSchema.get(brand(typeName));
				assert(propertySchema !== undefined);
				if (typeName === "converted.NamedProperty") {
					assert(propertySchema instanceof ObjectNodeSchema);
					const idFieldSchema =
						propertySchema.objectNodeFields.get(brand("guid")) ??
						fail("expected field");
					assert.deepEqual(idFieldSchema.kind, FieldKinds.required);
					assert.deepEqual(
						[...(idFieldSchema.types ?? fail("expected types"))],
						[leaf.string.name],
					);
				} else {
					if (typeName === nodePropertySchema.name) {
						assert(propertySchema instanceof MapNodeSchema);
						assert(propertySchema.mapFields.types === undefined);
						assert.deepEqual(propertySchema.mapFields.kind, FieldKinds.optional);
					} else {
						assert(propertySchema instanceof ObjectNodeSchema);
						assert.deepEqual(
							propertySchema.objectNodeFields.get(brand(nodePropertyField))?.types,
							new Set([nodePropertySchema.name]),
						);
						const idFieldSchema =
							propertySchema.objectNodeFields.get(brand("guid")) ??
							fail("expected field");
						assert.deepEqual(idFieldSchema.kind, FieldKinds.required);
						assert.deepEqual(
							[...(idFieldSchema.types ?? fail("expected types"))],
							[leaf.string.name],
						);
						if (typeName === "converted.RelationshipProperty") {
							const toFieldSchema =
								propertySchema.objectNodeFields.get(brand("to")) ??
								fail("expected field");
							assert.deepEqual(toFieldSchema.kind, FieldKinds.required);
							assert.deepEqual(
								[...(toFieldSchema.types ?? fail("expected types"))],
								["converted.Reference"],
							);
						}
					}
				}
				assert(!(propertySchema instanceof LeafNodeSchema));
				const originalName =
					typeName === nodePropertySchema.name
						? "NodeProperty"
						: typeName.split(".").slice(1).join(".");
				assert(
					fullSchemaData.nodeSchema.get(brand(`converted.map<${originalName}>`)) !==
						undefined,
				);
				assert(
					fullSchemaData.nodeSchema.get(brand(`converted.array<${originalName}>`)) !==
						undefined,
				);
			});
		});

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
				assert(fullSchemaData.nodeSchema.get(brand("converted.array<>")) === undefined);
				const convertedNodeSchema =
					fullSchemaData.nodeSchema.get(brand("converted.array<Any>")) ??
					fail("expected tree schema");
				assert(convertedNodeSchema instanceof FieldNodeSchema);
				const primary = convertedNodeSchema.getFieldSchema();
				assert(primary !== undefined);
				assert.deepEqual(primary.allowedTypes, [Any]);
			}

			{
				const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["map<>"]));
				assert(fullSchemaData.nodeSchema.get(brand("converted.map<>")) === undefined);
				const anyMap =
					fullSchemaData.nodeSchema.get(brand("converted.map<Any>")) ??
					fail("expected tree schema");
				assert(anyMap instanceof MapNodeSchema);
				assert.deepEqual(anyMap.mapFields.allowedTypes, [Any]);
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
			const neverTreeSchema = fullSchemaData.nodeSchema.get(
				brand("converted.Test:NeverType-1.0.0"),
			);
			assert(neverTreeSchema instanceof ObjectNodeSchema);
			assert.deepEqual([...neverTreeSchema.objectNodeFields], []);
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
			const nodeProperty = fullSchemaData.nodeSchema.get(nodePropertySchema.name);
			const testOptional = fullSchemaData.nodeSchema.get(
				brand("converted.Test:Optional-1.0.0"),
			);

			assert.equal(nodeProperty, nodePropertySchema);
			assert(testOptional instanceof ObjectNodeSchema);

			const miscField = testOptional?.objectNodeFields.get(brand("misc"));
			assert(miscField?.types !== undefined);
			assert.deepEqual(
				miscField.types,
				new Set([
					nodePropertySchema.name,
					"converted.NamedNodeProperty",
					"converted.RelationshipProperty",
					"converted.Test:Child-1.0.0",
					"converted.Test:Optional-1.0.0",
				]),
			);

			const mapField = testOptional?.objectNodeFields.get(brand(nodePropertyField));
			assert(mapField?.types !== undefined);
			assert.deepEqual(mapField.types, new Set([nodePropertySchema.name]));
		});

		it(`can use "NodeProperty" as root`, () => {
			const fullSchemaData = convertSchema(FieldKinds.optional, new Set(["NodeProperty"]));

			assert.deepEqual(fullSchemaData.rootFieldSchema.kind, FieldKinds.optional);
			assert.deepEqual(
				[...(fullSchemaData.rootFieldSchema.types ?? fail("expected root types"))],
				[
					nodePropertySchema.name,
					"converted.NamedNodeProperty",
					"converted.RelationshipProperty",
					"converted.Test:Child-1.0.0",
					"converted.Test:Optional-1.0.0",
				],
			);

			// 62 types (all types (including built in leaf types), their arrays and maps)
			assert.equal(fullSchemaData.nodeSchema.size, 62);
			const nodePropertySchemaLookedUp = fullSchemaData.nodeSchema.get(
				brand("com.fluidframework.PropertyDDSBuiltIn.NodeProperty"),
			);
			assert.equal(nodePropertySchemaLookedUp, nodePropertySchema);
		});

		it("can convert property with array context", () => {
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set(["Test:Optional-1.0.0"]),
			);
			const nodeSchema =
				fullSchemaData.nodeSchema.get(brand("converted.Test:Optional-1.0.0")) ??
				fail("missing schema");
			assert(nodeSchema instanceof ObjectNodeSchema);
			const arrayField =
				(nodeSchema.objectNodeFields.get(brand("childArray")) as TreeFieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(arrayField.kind, FieldKinds.optional);
			const arrayTypeName: TreeNodeSchemaIdentifier = brand(
				"converted.array<Test:Child-1.0.0>",
			);
			assert.deepEqual([...(arrayField.types ?? fail("expected types"))], [arrayTypeName]);
			const arraySchema = fullSchemaData.nodeSchema.get(arrayTypeName);
			assert(arraySchema instanceof FieldNodeSchema);
			const primary = arraySchema.getFieldSchema();
			assert.deepEqual(primary.kind, FieldKinds.sequence);
			assert.deepEqual(
				[...(primary.types ?? fail("expected types"))],
				["converted.Test:Child-1.0.0"],
			);
		});

		it("can convert property with map context", () => {
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set(["Test:Optional-1.0.0"]),
			);
			const nodeSchema = fullSchemaData.nodeSchema.get(
				brand("converted.Test:Optional-1.0.0"),
			);
			assert(nodeSchema instanceof ObjectNodeSchema);
			const mapField =
				nodeSchema.objectNodeFields.get(brand("childMap")) ?? fail("expected field schema");
			assert.deepEqual(mapField.kind, FieldKinds.optional);
			const mapTypeName: TreeNodeSchemaIdentifier = brand("converted.map<Test:Child-1.0.0>");
			assert.deepEqual([...(mapField.types ?? fail("expected types"))], [mapTypeName]);
			const mapSchema = fullSchemaData.nodeSchema.get(mapTypeName);
			assert(mapSchema instanceof MapNodeSchema);
			assert.deepEqual(mapSchema.mapFields.kind, FieldKinds.optional);
			assert.deepEqual(
				[...(mapSchema.mapFields.types ?? fail("expected types"))],
				["converted.Test:Child-1.0.0"],
			);
		});

		it(`"set" context is not supported`, () => {
			assert.throws(
				() => convertSchema(FieldKinds.optional, new Set(["set<Test:Optional-1.0.0>"])),
				(e: Error) => validateAssertionError(e, `Context "set" is not supported yet`),
				"Expected exception was not thrown",
			);
		});

		it(`can convert property w/o typeid into field of type Any`, () => {
			const extraTypeName = "Test:IndependentType-1.0.0";
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				Any,
				new Set([extraTypeName]),
			);
			const extraTypeSchema = fullSchemaData.nodeSchema.get(
				brand(`converted.${extraTypeName}`),
			);
			assert(extraTypeSchema instanceof ObjectNodeSchema);
			const anyField =
				extraTypeSchema.objectNodeFields.get(brand("any")) ?? fail("expected field schema");
			assert.deepEqual(anyField.kind, FieldKinds.optional);
			assert(anyField.types === undefined);
			assert.deepEqual(anyField.allowedTypes, [Any]);

			const mapOfAnyField =
				(extraTypeSchema?.objectNodeFields.get(brand("mapOfAny")) as TreeFieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(
				[...(mapOfAnyField.types ?? fail("expected types"))],
				["converted.map<Any>"],
			);

			const arrayOfAnyField =
				(extraTypeSchema?.objectNodeFields.get(brand("arrayOfAny")) as TreeFieldSchema) ??
				fail("expected field schema");
			assert.deepEqual(
				[...(arrayOfAnyField.types ?? fail("expected types"))],
				["converted.array<Any>"],
			);
		});

		it(`can use independent and 'Any' types as allowed root types`, () => {
			// note: "Test:IndependentType-1.0.0" does not belong to any inheritance chain i.e.
			// it is not included into the full schema automatically
			const extraTypeName = "Test:IndependentType-1.0.0";
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				new Set([extraTypeName, Any]),
			);
			assert(
				fullSchemaData.nodeSchema.get(brand(`converted.${extraTypeName}`)) !== undefined,
			);
			assert(fullSchemaData.rootFieldSchema.types === undefined);
		});

		it(`can use extra schemas`, () => {
			// note: "Test:IndependentType-1.0.0" does not belong to any inheritance chain i.e.
			// it is not included into the full schema automatically
			const extraTypeName = "Test:IndependentType-1.0.0";
			// provided no extra types
			{
				const fullSchemaData = convertSchema(FieldKinds.optional, Any);
				assert(
					fullSchemaData.nodeSchema.get(brand(`converted.${extraTypeName}`)) ===
						undefined,
				);
			}
			// with extra types
			{
				const fullSchemaData = convertSchema(
					FieldKinds.optional,
					Any,
					new Set([extraTypeName]),
				);
				assert(
					fullSchemaData.nodeSchema.get(brand(`converted.${extraTypeName}`)) !==
						undefined,
				);
			}
		});

		it(`can use enums`, () => {
			const enumTypeName = `Test:Optional-1.0.0`;
			const fullSchemaData = convertSchema(
				FieldKinds.optional,
				Any,
				new Set([`enum<${enumTypeName}>`]),
			);
			const enumSchema = fullSchemaData.nodeSchema.get(
				brand(`converted.enum<${enumTypeName}>`),
			);
			assert(enumSchema && schemaIsFieldNode(enumSchema));
			assert(
				enumSchema.info.equals(TreeFieldSchema.create(FieldKinds.required, [leaf.number])),
			);

			const arrayOfEnums = fullSchemaData.nodeSchema.get(
				brand(`converted.array<enum<${enumTypeName}>>`),
			);
			assert(arrayOfEnums instanceof FieldNodeSchema);
			const primary = arrayOfEnums.getFieldSchema();
			assert(primary);
			assert.deepEqual([...primary.allowedTypes][0], enumSchema);

			const mapOfEnums = fullSchemaData.nodeSchema.get(
				brand(`converted.map<enum<${enumTypeName}>>`),
			);
			assert(mapOfEnums instanceof MapNodeSchema);
			assert.deepEqual([...mapOfEnums.mapFields.allowedTypes][0], enumSchema);
		});

		it(`can use recursive schemas`, () => {
			const parentTypeName = "Test:Optional-1.0.0";
			const childTypeName = "Test:Child-1.0.0";
			const childFieldKey: FieldKey = brand("child");
			const parentFieldKey: FieldKey = brand("parent");

			const convertedChildTypeName: TreeNodeSchemaIdentifier = brand(
				`converted.${childTypeName}`,
			);
			const convertedParentTypeName: TreeNodeSchemaIdentifier = brand(
				`converted.${parentTypeName}`,
			);

			const fullSchemaData = convertSchema(FieldKinds.optional, new Set([parentTypeName]));

			assert.deepEqual(
				[...(fullSchemaData.rootFieldSchema.types ?? fail("expected types"))],
				[convertedParentTypeName, convertedChildTypeName],
			);
			const parentSchema = fullSchemaData.nodeSchema.get(convertedParentTypeName);
			assert(parentSchema instanceof ObjectNodeSchema);
			const childFieldSchema =
				parentSchema.objectNodeFields.get(childFieldKey) ?? fail("expected field schema");
			assert.deepEqual(
				[...(childFieldSchema.types ?? fail("expected types"))],
				[convertedChildTypeName],
			);

			const childSchema = fullSchemaData.nodeSchema.get(convertedChildTypeName);
			assert(childSchema instanceof ObjectNodeSchema);
			const parentFieldSchema =
				childSchema.objectNodeFields.get(parentFieldKey) ?? fail("expected field schema");
			assert.deepEqual(
				[...(parentFieldSchema.types ?? fail("expected types"))],
				[convertedParentTypeName, convertedChildTypeName],
			);
			const childOfChildFieldSchema =
				childSchema.objectNodeFields.get(childFieldKey) ?? fail("expected field schema");
			assert(childOfChildFieldSchema.equals(childFieldSchema));
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
