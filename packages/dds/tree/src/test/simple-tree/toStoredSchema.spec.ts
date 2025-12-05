/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	generateSchemaFromSimpleSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
	type SimpleAllowedTypeAttributes,
} from "../../simple-tree/index.js";
import {
	getStoredSchema,
	permissiveStoredSchemaGenerationOptions,
	restrictiveStoredSchemaGenerationOptions,
	toInitialSchema,
	simpleStoredSchemaToStoredSchema,
	toStoredSchema,
	transformSimpleNodeSchema,
	filterAllowedTypes,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
import {
	ExpectStored,
	Unchanged,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import {
	cursorForJsonableTreeField,
	defaultSchemaPolicy,
	FieldKinds,
	isFieldInSchema,
	mapTreeFieldFromCursor,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	HasStagedAllowedTypes,
	HasStagedAllowedTypesAfterUpdate,
	testDocuments,
} from "../testTrees.js";
import { EmptyKey } from "../../core/index.js";
import { exportSimpleSchema } from "../../shared-tree/index.js";

describe("toStoredSchema", () => {
	describe("toStoredSchema", () => {
		it("minimal", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.object("A", {}) {}
			const stored = toStoredSchema(A, restrictiveStoredSchemaGenerationOptions);
			assert.equal(stored.rootFieldSchema.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.rootFieldSchema.types, new Set([A.identifier]));
			const storedNodeSchema = stored.nodeSchema.get(brand(A.identifier));
			assert(storedNodeSchema !== undefined);
			assert.deepEqual(storedNodeSchema.encodeV1(), {
				object: Object.create(null),
			});
		});
		it("name collision", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.object("A", {}) {}
			class B extends schema.object("A", {}) {}

			assert.throws(
				() => toStoredSchema([A, B], restrictiveStoredSchemaGenerationOptions),
				/identifier "com.example.A"/,
			);
		});
		it("builtins are the same", () => {
			const schema = new SchemaFactory("com.example");
			const schema2 = new SchemaFactory("com.example");
			assert.equal(schema.number, schema2.number);
		});

		describe("test documents", () => {
			for (const testCase of testDocuments) {
				describe(testCase.name, () => {
					if (
						testCase.requiresStagedSchema === true ||
						testCase.hasUnknownOptionalFieldSchema === true
					) {
						// If the document is relying on forwards compatibility options (staged schema or unknown optional fields),
						// then we do not expect to be able to get the same stored schema as in the document by deriving a stored schema from the view schema.
						// For cases just using staged schema, this validates that the staged schema is being discarded due to restrictiveStoredSchemaGenerationOptions,
						// but the main reason for this conditional is to avoid these cases breaking the "Matches document" case below.
						it("Does not match document", () => {
							const restrictive = toStoredSchema(
								testCase.schema,
								restrictiveStoredSchemaGenerationOptions,
							);
							assert.notDeepEqual(restrictive, testCase.schemaData);
						});
					} else {
						// Ensure that the stored schema captured in these test documents matches what we would generate from the view schema.
						// We can only test this in cases where the document is not relying on forwards compatibility options.
						it("Matches document", () => {
							const restrictive = toStoredSchema(
								testCase.schema,
								restrictiveStoredSchemaGenerationOptions,
							);
							assert.deepEqual(restrictive, testCase.schemaData);
						});
					}

					it("Restrictive and Permissive", () => {
						const restrictive = toStoredSchema(
							testCase.schema,
							restrictiveStoredSchemaGenerationOptions,
						);
						const permissive = toStoredSchema(
							testCase.schema,
							permissiveStoredSchemaGenerationOptions,
						);

						// The restrictive case, used for initial schemas and upgrades, does not include any staged allowed types.
						// The permissive case, used for unhydrated trees, includes all staged allowed types.
						// They should be equal if an only if there are no staged allowed types.
						if (testCase.hasStagedSchema) {
							assert.notDeepEqual(restrictive, permissive);
						} else {
							assert.deepEqual(restrictive, permissive);
						}

						const tree = mapTreeFieldFromCursor(
							cursorForJsonableTreeField(testCase.treeFactory()),
						);

						// Our test case has an actual tree which is known to comply with its existing stored schema, and the test case's view schema.
						// Therefore, the tree must be in schema for the permissive case, with the exception of any unknown optional fields.
						// We can assert this here.
						// This is a sanity check that the produced permissive schema actually allows the trees it's supposed to.
						// This could catch bugs where simple to stored to simple round trip is correct, but the corresponding stored schema is wrong.
						isFieldInSchema(
							tree,
							permissive.rootFieldSchema,
							{
								schema: permissive,
								policy: defaultSchemaPolicy,
							},
							() => {
								assert(testCase.hasUnknownOptionalFields);
								return true;
							},
						);

						const restrictiveOutOfSchema = isFieldInSchema(
							tree,
							restrictive.rootFieldSchema,
							{
								schema: restrictive,
								policy: defaultSchemaPolicy,
							},
							() => true,
						);
						// Similar to above, we check the produced restrictive schema actually behaves correctly for the test tree.
						assert.equal(
							restrictiveOutOfSchema === true,
							testCase.requiresStagedSchema === true ||
								testCase.hasUnknownOptionalFields === true,
						);

						// These aren't the tests for "exportSimpleSchema", but toStored should work with them, so we can use them to check consistency and round trip.
						const simpleFromRestrictive = exportSimpleSchema(restrictive);
						const simpleFromPermissive = exportSimpleSchema(permissive);

						if (testCase.hasStagedSchema) {
							assert.notDeepEqual(simpleFromRestrictive, simpleFromPermissive);
						} else {
							assert.deepEqual(simpleFromRestrictive, simpleFromPermissive);
						}

						const restrictive2 = simpleStoredSchemaToStoredSchema(simpleFromRestrictive);
						const permissive2 = simpleStoredSchemaToStoredSchema(simpleFromPermissive);

						assert.deepEqual(restrictive2, restrictive);
						assert.deepEqual(permissive2, permissive);

						// To further ensure toStoredSchema works with the other schema transforming APIs,
						// validate it with generateSchemaFromSimpleSchema to round trip through view schema.
						// View schema generated from stored schema will never contain staged schema:
						// they will either have been removed, or baked in (with the fact they were staged having been lost).
						const restrictive3 = toStoredSchema(
							generateSchemaFromSimpleSchema(simpleFromRestrictive).root,
							{
								includeStaged: () => assert.fail(),
							},
						);
						const permissive3 = toStoredSchema(
							generateSchemaFromSimpleSchema(simpleFromPermissive).root,
							{
								includeStaged: () => assert.fail(),
							},
						);

						assert.deepEqual(restrictive3, restrictive);
						assert.deepEqual(permissive3, permissive);
					});
				});
			}
		});
	});

	describe("toInitialSchema with staged schema", () => {
		it("root", () => {
			const converted = toInitialSchema(
				SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			);
			const field = converted.rootFieldSchema;
			assert.equal(field.types.size, 1);
		});

		it("shallow", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");
			class TestArray extends schemaFactory.arrayAlpha(
				"TestArray",
				SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			) {}

			const converted = toInitialSchema(TestArray);
			const node = converted.nodeSchema.get(brand(TestArray.identifier)) ?? assert.fail();
			const field = node.getFieldSchema(EmptyKey);
			assert.equal(field.types.size, 1);
		});

		it("nested", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");
			class TestArray extends schemaFactory.arrayAlpha(
				"TestArray",
				SchemaFactoryAlpha.types([
					SchemaFactoryAlpha.number,
					SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
				]),
			) {}
			class Root extends schemaFactory.objectAlpha("TestObject", {
				foo: TestArray,
			}) {}
			const converted = toInitialSchema(Root);
			const node = converted.nodeSchema.get(brand(TestArray.identifier)) ?? assert.fail();
			const field = node.getFieldSchema(EmptyKey);
			assert.equal(field.types.size, 1);
		});
	});

	describe("filterAllowedTypes", () => {
		it("minimal", () => {
			const stored = filterAllowedTypes(
				SchemaFactoryAlpha.required(SchemaFactory.number).simpleAllowedTypes,
				restrictiveStoredSchemaGenerationOptions,
			);
			assert.deepEqual(
				stored,
				new Map([[SchemaFactory.number.identifier, { isStaged: undefined }]]),
			);
		});

		it("staged", () => {
			const storedRestrictive = filterAllowedTypes(
				SchemaFactoryAlpha.required(
					SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
				).simpleAllowedTypes,
				restrictiveStoredSchemaGenerationOptions,
			);
			const staged = SchemaFactoryAlpha.staged(SchemaFactory.number);
			const storedPermissive = filterAllowedTypes(
				SchemaFactoryAlpha.required(SchemaFactoryAlpha.types([staged])).simpleAllowedTypes,
				permissiveStoredSchemaGenerationOptions,
			);
			const view = filterAllowedTypes(
				SchemaFactoryAlpha.required(
					SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
				).simpleAllowedTypes,
				Unchanged,
			);
			assert.deepEqual(storedRestrictive, new Map());
			assert.deepEqual(
				storedPermissive,
				new Map([[SchemaFactory.number.identifier, { isStaged: undefined }]]),
			);
			assert.deepEqual(
				view,
				new Map([
					[
						SchemaFactory.number.identifier,
						{
							isStaged: staged.metadata.stagedSchemaUpgrade,
						} satisfies SimpleAllowedTypeAttributes,
					],
				]),
			);

			assert.throws(
				() =>
					filterAllowedTypes(
						SchemaFactoryAlpha.required(
							SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
						).simpleAllowedTypes,
						ExpectStored,
					),
				validateUsageError(
					/use of `ExpectStored`, but view schema specific content was encountered/,
				),
			);
		});
	});

	describe("getStoredSchema", () => {
		it("options", () => {
			const v1 = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedAllowedTypes,
					restrictiveStoredSchemaGenerationOptions,
				),
			);
			const v2 = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedAllowedTypesAfterUpdate,
					restrictiveStoredSchemaGenerationOptions,
				),
			);
			const v1Permissive = getStoredSchema(
				transformSimpleNodeSchema(
					HasStagedAllowedTypes,
					permissiveStoredSchemaGenerationOptions,
				),
			);
			assert.notDeepEqual(v1.encodeV1(), v1Permissive.encodeV1());
			assert.deepEqual(v1Permissive.encodeV1(), v2.encodeV1());
		});
	});
});
