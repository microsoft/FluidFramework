/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { hydrate } from "./utils.js";
import {
	prepareForInsertionContextless,
	SchemaFactory,
	TreeArrayNode,
} from "../../simple-tree/index.js";
import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	ValueSchema,
	type FieldKey,
	type FieldKindData,
	type FieldKindIdentifier,
	type SchemaAndPolicy,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
} from "../../core/index.js";
import { brand } from "../../util/index.js";
import { checkoutWithContent } from "../utils.js";
import {
	FieldKinds,
	MockNodeIdentifierManager,
	type FlexTreeHydratedContext,
} from "../../feature-libraries/index.js";

// proxies.spec.ts has a lot of coverage for this code, but is focused on other things, and more integration test oriented.
// Here are a few key tests for prepareForInsertion covering cases which are known to be likely to have issues.

// Note that test utility `hydrate` as well as all insert APIs call `prepareForInsertion` internally.

const factory = new SchemaFactory("test");

describe("prepareForInsertion", () => {
	it("multiple top level objects", () => {
		class Obj extends factory.object("Obj", {}) {}
		class ParentArray extends factory.array("testA", Obj) {}
		const a = new Obj({});
		const b = new Obj({});
		const root = hydrate(ParentArray, []);
		root.insertAtStart(TreeArrayNode.spread([a, b]));
		// Check that the inserted and read proxies are the same object
		assert.equal(a, root[0]);
		assert.equal(b, root[1]);
	});

	it("nested objects", () => {
		class Obj extends factory.object("Obj", {}) {}
		class Parent extends factory.object("Parent", { child: Obj }) {}

		// Under literal
		{
			const child = new Obj({});
			const root = hydrate(Parent, { child });
			assert.equal(child, root.child);
		}

		// Under TreeNode
		{
			const child = new Obj({});
			const parent = new Parent({ child });
			const root = hydrate(Parent, parent);
			assert.equal(parent, root);
			assert.equal(child, root.child);
		}
	});

	it("nested objects at non zero index", () => {
		class A extends factory.arrayRecursive("testA", [() => A]) {}
		const deep1 = new A();
		const deep2 = new A();

		const root = hydrate(A, new A([deep1, deep2]));

		assert.equal(deep1, root[0]);
		assert.equal(deep2, root[1]);
	});

	describe("Stored schema validation", () => {
		/**
		 * Creates a schema and policy and indicates stored schema validation should be performed.
		 */
		function createSchemaAndPolicy(
			nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map(),
			fieldKinds: Map<FieldKindIdentifier, FieldKindData> = new Map(),
		): [SchemaAndPolicy, Pick<FlexTreeHydratedContext, "checkout" | "nodeKeyManager">] {
			const schemaAndPolicy = {
				schema: {
					nodeSchema,
				},
				policy: {
					fieldKinds,
					validateSchema: true,
					// toMapTree drops all extra fields, so varying this policy is unnecessary
					// (schema validation only occurs after converting to a MapTree)
					allowUnknownOptionalFields: () => false,
				},
			};

			return [
				schemaAndPolicy,
				{
					checkout: checkoutWithContent({
						schema: {
							...schemaAndPolicy.schema,
							rootFieldSchema: storedEmptyFieldSchema,
						},
						initialTree: undefined,
					}),
					nodeKeyManager: new MockNodeIdentifierManager(),
				},
			] as const;
		}

		const outOfSchemaExpectedError: Partial<Error> = {
			message: "Tree does not conform to schema.",
		};

		const schemaFactory = new SchemaFactory("test");

		describe("mapTreeFromNodeData", () => {
			/**
			 * Helper for building {@link TreeFieldStoredSchema}.
			 */
			function getFieldSchema(
				kind: { identifier: FieldKindIdentifier },
				allowedTypes: Iterable<TreeNodeSchemaIdentifier>,
			): TreeFieldStoredSchema {
				return {
					kind: kind.identifier,
					types: new Set(allowedTypes),
				};
			}

			describe("Leaf node", () => {
				function createSchemaAndPolicyForLeafNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
						]),
						new Map(),
					);
				}

				it("Success", () => {
					const content = "Hello world";
					const schemaValidationPolicy = createSchemaAndPolicyForLeafNode();
					prepareForInsertionContextless(
						content,
						schemaFactory.string,
						...schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const content = "Hello world";
					const schemaValidationPolicy = createSchemaAndPolicyForLeafNode(true);
					assert.throws(
						() =>
							prepareForInsertionContextless(
								content,
								[schemaFactory.string],
								...schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});
			});

			describe("Object node", () => {
				const content = { foo: "Hello world" };
				const fieldSchema = getFieldSchema(FieldKinds.required, [
					brand(schemaFactory.string.identifier),
				]);
				const myObjectSchema = schemaFactory.object("myObject", {
					foo: schemaFactory.string,
				});

				function createSchemaAndPolicyForObjectNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
							[
								brand(myObjectSchema.identifier),
								new ObjectNodeStoredSchema(
									new Map<FieldKey, TreeFieldStoredSchema>([[brand("foo"), fieldSchema]]),
								),
							],
						]),
						new Map([[fieldSchema.kind, FieldKinds.required]]),
					);
				}
				it("Success", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForObjectNode();
					prepareForInsertionContextless(
						content,
						[myObjectSchema, schemaFactory.string],
						...schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForObjectNode(true);
					assert.throws(
						() =>
							prepareForInsertionContextless(
								content,
								[myObjectSchema, schemaFactory.string],
								...schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});

				it("Only imports data in the schema", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForObjectNode();
					// Note that despite the content containing keys not in the object schema, this test passes.
					// This is by design: if an app author wants to preserve data that isn't in the schema (ex: to
					// collaborate with other clients that have newer schema without erasing auxiliary data), they
					// can use import/export tree APIs as noted in `SchemaFactoryObjectOptions`.
					prepareForInsertionContextless(
						{ foo: "Hello world", notInSchemaKey: 5, anotherNotInSchemaKey: false },
						[myObjectSchema, schemaFactory.string],
						...schemaValidationPolicy,
					);
				});
			});

			describe("Map node", () => {
				const content = new Map([["foo", "Hello world"]]);
				const fieldSchema = getFieldSchema(FieldKinds.required, [
					brand(schemaFactory.string.identifier),
				]);
				const myMapSchema = schemaFactory.map("myMap", [schemaFactory.string]);

				function createSchemaAndPolicyForMapNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
							[brand(myMapSchema.identifier), new MapNodeStoredSchema(fieldSchema)],
						]),
						new Map([[fieldSchema.kind, FieldKinds.required]]),
					);
				}
				it("Success", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode();
					prepareForInsertionContextless(
						content,
						[myMapSchema, schemaFactory.string],
						...schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode(true);
					assert.throws(
						() =>
							prepareForInsertionContextless(
								content,
								[myMapSchema, schemaFactory.string],
								...schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});
			});

			describe("Array node", () => {
				const content = ["foo"];
				const fieldSchema = getFieldSchema(FieldKinds.required, [
					brand(schemaFactory.string.identifier),
				]);
				const myArrayNodeSchema = schemaFactory.array("myArrayNode", [schemaFactory.string]);

				function createSchemaAndPolicyForMapNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
							[brand(myArrayNodeSchema.identifier), new MapNodeStoredSchema(fieldSchema)],
						]),
						new Map([[fieldSchema.kind, FieldKinds.required]]),
					);
				}
				it("Success", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode();
					prepareForInsertionContextless(
						content,
						[myArrayNodeSchema, schemaFactory.string],
						...schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode(true);
					assert.throws(
						() =>
							prepareForInsertionContextless(
								content,
								[myArrayNodeSchema, schemaFactory.string],
								...schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});
			});
		});
	});
});
