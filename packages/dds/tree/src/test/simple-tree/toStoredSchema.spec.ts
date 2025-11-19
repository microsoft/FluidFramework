/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	createSchemaUpgrade,
	ExpectStored,
	FieldKind,
	generateSchemaFromSimpleSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
	type SimpleFieldSchema,
} from "../../simple-tree/index.js";
import {
	convertField,
	getStoredSchema,
	permissiveStoredSchemaGenerationOptions,
	restrictiveStoredSchemaGenerationOptions,
	toInitialSchema,
	toSimpleStoredToStoredSchema,
	toStoredSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
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
					if (!testCase.hasStagedSchema && !testCase.hasUnknownOptionalFields) {
						it("Matches document", () => {
							const restrictive = toStoredSchema(
								testCase.schema,
								restrictiveStoredSchemaGenerationOptions,
							);
							assert.deepEqual(restrictive, testCase.schemaData);
						});
					} else {
						it("Does not match document", () => {
							const restrictive = toStoredSchema(
								testCase.schema,
								restrictiveStoredSchemaGenerationOptions,
							);
							assert.notDeepEqual(restrictive, testCase.schemaData);
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
						if (testCase.hasStagedSchema) {
							assert.notDeepEqual(restrictive, permissive);
						} else {
							assert.deepEqual(restrictive, permissive);
						}

						const tree = mapTreeFieldFromCursor(
							cursorForJsonableTreeField(testCase.treeFactory()),
						);

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
						assert.equal(
							restrictiveOutOfSchema === true,
							testCase.requiresStagedSchema === true ||
								testCase.hasUnknownOptionalFields === true,
						);

						// These arn't the tests for "exportSimpleSchema", but toStored should work with them, so we can use them to check consistency and round trip.
						const simplerRestrictive = exportSimpleSchema(restrictive);
						const simplerPermissive = exportSimpleSchema(permissive);

						if (testCase.hasStagedSchema) {
							assert.notDeepEqual(simplerRestrictive, simplerPermissive);
						} else {
							assert.deepEqual(simplerRestrictive, simplerPermissive);
						}

						const restrictive2 = toSimpleStoredToStoredSchema(simplerRestrictive);
						const permissive2 = toSimpleStoredToStoredSchema(simplerPermissive);

						assert.deepEqual(restrictive2, restrictive);
						assert.deepEqual(permissive2, permissive);

						const restrictive3 = toStoredSchema(
							generateSchemaFromSimpleSchema(simplerRestrictive).root,
							{
								includeStaged: () => assert.fail(),
							},
						);
						const permissive3 = toStoredSchema(
							generateSchemaFromSimpleSchema(simplerPermissive).root,
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

	describe("convertField", () => {
		it("minimal", () => {
			const stored = convertField(
				SchemaFactoryAlpha.required(SchemaFactory.number),
				restrictiveStoredSchemaGenerationOptions,
			);
			assert.equal(stored.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.types, new Set([SchemaFactory.number.identifier]));
		});

		it("staged", () => {
			const storedRestrictive = convertField(
				SchemaFactoryAlpha.required(
					SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
				),
				restrictiveStoredSchemaGenerationOptions,
			);
			const storedPermissive = convertField(
				SchemaFactoryAlpha.required(
					SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactory.number)]),
				),
				permissiveStoredSchemaGenerationOptions,
			);
			assert.equal(storedRestrictive.kind, FieldKinds.required.identifier);
			assert.deepEqual(storedRestrictive.types, new Set([]));
			assert.equal(storedPermissive.kind, FieldKinds.required.identifier);
			assert.deepEqual(storedPermissive.types, new Set([SchemaFactory.number.identifier]));
		});

		it(" StoredSchemaGenerationOptions cases", () => {
			const stagedFalse: SimpleFieldSchema = {
				kind: FieldKind.Optional,
				simpleAllowedTypes: new Map([["X", { isStaged: false }]]),
				metadata: {},
			};

			const upgrade = createSchemaUpgrade();
			const stagedUpgrade: SimpleFieldSchema = {
				kind: FieldKind.Optional,
				simpleAllowedTypes: new Map([["X", { isStaged: upgrade }]]),
				metadata: {},
			};

			const stagedUndefined: SimpleFieldSchema = {
				kind: FieldKind.Optional,
				simpleAllowedTypes: new Map([["X", { isStaged: undefined }]]),
				metadata: {},
			};

			// Valid cases:
			const f1 = convertField(stagedFalse, { includeStaged: () => assert.fail() });
			const f2 = convertField(stagedUpgrade, {
				includeStaged: (u) => {
					assert.equal(u, upgrade);
					return true;
				},
			});
			const f3 = convertField(stagedUpgrade, {
				includeStaged: (u) => {
					assert.equal(u, upgrade);
					return false;
				},
			});
			const f4 = convertField(stagedUndefined, ExpectStored);
			assert.deepEqual(f1, {
				kind: "Optional",
				persistedMetadata: undefined,
				types: new Set(["X"]),
			});
			assert.deepEqual(f2, {
				kind: "Optional",
				persistedMetadata: undefined,
				types: new Set(["X"]),
			});
			assert.deepEqual(f3, {
				kind: "Optional",
				persistedMetadata: undefined,
				types: new Set(),
			});
			assert.deepEqual(f4, {
				kind: "Optional",
				persistedMetadata: undefined,
				types: new Set(["X"]),
			});

			// invalid cases
			assert.throws(
				() => convertField(stagedFalse, ExpectStored),
				validateUsageError(
					/input schema should be a stored schema, but it had `isStaged` not set to `undefined`/,
				),
			);
			assert.throws(
				() => convertField(stagedUpgrade, ExpectStored),
				validateUsageError(
					/input schema should be a stored schema, but it had `isStaged` not set to `undefined`/,
				),
			);
			assert.throws(
				() => convertField(stagedUndefined, { includeStaged: () => assert.fail() }),
				validateUsageError(/stored schema as view schema/),
			);
		});
	});

	describe("getStoredSchema", () => {
		it("options", () => {
			const v1 = getStoredSchema(
				HasStagedAllowedTypes,
				restrictiveStoredSchemaGenerationOptions,
			);
			const v2 = getStoredSchema(
				HasStagedAllowedTypesAfterUpdate,
				restrictiveStoredSchemaGenerationOptions,
			);
			const v1Permissive = getStoredSchema(
				HasStagedAllowedTypes,
				permissiveStoredSchemaGenerationOptions,
			);
			assert.notDeepEqual(v1.encodeV1(), v1Permissive.encodeV1());
			assert.deepEqual(v1Permissive.encodeV1(), v2.encodeV1());
		});
	});
});
