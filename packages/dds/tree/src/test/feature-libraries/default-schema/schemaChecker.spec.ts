/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Multiplicity } from "../../../../dist/index.js";
// Reaching into internal module just to test it
import {
	SchemaValidationErrors,
	compliesWithMultiplicity,
	isFieldInSchema,
	isNodeInSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-schema/schemaChecker.js";
// eslint-disable-next-line import/no-internal-modules
import { SchemaFactory } from "../../../simple-tree/schemaFactory.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeConfiguration } from "../../../simple-tree/tree.js";
import { getView } from "../../utils.js";
import { FieldKinds, type FullSchemaPolicy } from "../../../feature-libraries/index.js";
import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ValueSchema,
	type FieldKey,
	type FieldKindIdentifier,
	type MapTree,
	type StoredSchemaCollection,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type Value,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import type { IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { unreachableCase } from "../../../../../../common/core-utils/dist/unreachable.js";

export class TestFluidHandle implements IFluidHandle {
	public absolutePath: string = "fakePath";
	public isAttached: boolean = false;

	public get IFluidHandle(): IFluidHandle {
		return this;
	}

	public async get(): Promise<any> {
		throw new Error("Method not implemented.");
	}

	public bind(handle: IFluidHandle): void {
		throw new Error("Method not implemented.");
	}

	public attachGraph(): void {
		throw new Error("Method not implemented.");
	}

	public async resolveHandle(request: IRequest): Promise<IResponse> {
		throw new Error("Method not implemented.");
	}
}

const emptySchemaPolicy: FullSchemaPolicy = {
	fieldKinds: new Map(),
};

const emptySchemaCollection: StoredSchemaCollection = {
	nodeSchema: new Map(),
};

describe.only("schema validation", () => {
	const multiplicityTestCases: [
		kind: Multiplicity,
		numberToTest: number,
		expectedResult: boolean,
	][] = [
		[Multiplicity.Forbidden, 0, true],
		[Multiplicity.Forbidden, 1, false],
		[Multiplicity.Single, 0, false],
		[Multiplicity.Single, 1, true],
		[Multiplicity.Single, 2, false],
		[Multiplicity.Sequence, 0, true],
		[Multiplicity.Sequence, 1, true],
		[Multiplicity.Sequence, 2, true],
		[Multiplicity.Optional, 0, true],
		[Multiplicity.Optional, 1, true],
		[Multiplicity.Optional, 2, false],
	];
	for (const [kind, numberToTest, expectedResult] of multiplicityTestCases) {
		it(`compliesWithMultiplicity(${numberToTest}, ${Multiplicity[kind]}) === ${expectedResult}`, () => {
			const actual = compliesWithMultiplicity(numberToTest, kind);
			assert.equal(actual, expectedResult);
		});
	}

	describe("isNodeInSchema", () => {
		function createValueNode(nodeSchemaIdentifier: string, value: Value): MapTree {
			return {
				type: brand(nodeSchemaIdentifier),
				value,
				fields: new Map(),
			};
		}
		function createMapNode(
			nodeSchemaIdentifier: string,
			fields: Map<FieldKey, MapTree[]>,
		): MapTree {
			return {
				type: brand(nodeSchemaIdentifier),
				value: undefined,
				fields,
			};
		}
		describe("LeafNodeStoredSchema", () => {
			const numberNode = createValueNode("myNumberNode", 1);
			const stringNode = createValueNode("myStringNode", "string");
			const booleanNode = createValueNode("myBooleanNode", false);
			const nullNode = createValueNode("myNullNode", null);
			const undefinedNode = createValueNode("myUndefinedNode", undefined);
			const fluidHandleNode = createValueNode("myFluidHandleNode", new TestFluidHandle());
			const nodeCases = [
				numberNode,
				stringNode,
				booleanNode,
				nullNode,
				undefinedNode,
				fluidHandleNode,
			];

			// Making the key of the record a ValueSchema ensures that we'll get compile-time errors if we add new
			// ValueSchema values but forget to add test cases for it.
			const testCases: Record<ValueSchema, any> = {
				[ValueSchema.Number]: {
					schema: new LeafNodeStoredSchema(ValueSchema.Number),
					positiveNodeType: numberNode,
				},
				[ValueSchema.String]: {
					schema: new LeafNodeStoredSchema(ValueSchema.String),
					positiveNodeType: stringNode,
				},
				[ValueSchema.Boolean]: {
					schema: new LeafNodeStoredSchema(ValueSchema.Boolean),
					positiveNodeType: booleanNode,
				},
				[ValueSchema.Null]: {
					schema: new LeafNodeStoredSchema(ValueSchema.Null),
					positiveNodeType: nullNode,
				},
				[ValueSchema.FluidHandle]: {
					schema: new LeafNodeStoredSchema(ValueSchema.FluidHandle),
					positiveNodeType: fluidHandleNode,
				},
			};

			for (const [key, testCaseData] of Object.entries(testCases)) {
				describe(`ValueSchema.${ValueSchema[parseInt(key, 10)]}`, () => {
					for (const node of nodeCases) {
						const expectedResult =
							testCaseData.positiveNodeType === node
								? SchemaValidationErrors.NoError
								: node === undefinedNode
								? SchemaValidationErrors.LeafNodeWithNoValue
								: SchemaValidationErrors.LeafNodeValueNotAllowed;
						it(`${node.type} is in schema: ${expectedResult}`, () => {
							assert.equal(
								isNodeInSchema(
									node,
									testCaseData.schema,
									emptySchemaCollection,
									emptySchemaPolicy,
								),
								expectedResult,
							);
						});
					}
				});
			}
		});

		describe("MapNodeStoredSchema", () => {
			const numberNode = createValueNode("myNumberNode", 1);
			const stringNode = createValueNode("myStringNode", "string");
			const booleanNode = createValueNode("myBooleanNode", false);
			const nullNode = createValueNode("myNullNode", null);
			const undefinedNode = createValueNode("myUndefinedNode", undefined);
			const fluidHandleNode = createValueNode("myFluidHandleNode", new TestFluidHandle());

			/**
			 * Helper for building {@link TreeFieldStoredSchema}.
			 */
			function fieldSchema(
				kind: { identifier: FieldKindIdentifier },
				types?: Iterable<TreeNodeSchemaIdentifier>,
			): TreeFieldStoredSchema {
				return {
					kind: kind.identifier,
					types: types === undefined ? undefined : new Set(types),
				};
			}

			it(`not in schema due to empty schemaCollection`, () => {
				// Schema for a map node whose fields are required and must contain a number.
				const schema = new MapNodeStoredSchema(
					fieldSchema(FieldKinds.required, [numberNode.type]),
				);
				const mapNode_oneNumber = createMapNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				assert.equal(
					isNodeInSchema(
						mapNode_oneNumber,
						schema,
						emptySchemaCollection,
						emptySchemaPolicy,
					),
					SchemaValidationErrors.UnknownError,
				);
			});

			it(`mapNode with required fields of a single kind`, () => {
				const fieldSchema_requiredNumberNode = fieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const schema = new MapNodeStoredSchema(fieldSchema_requiredNumberNode);
				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				};
				const schemaPolicy = {
					fieldKinds: new Map([
						[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
					]),
				};

				const mapNode = createMapNode("myNumberMapNode", new Map());

				// In schema while empty
				assert.equal(
					isNodeInSchema(mapNode, schema, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a valid number node
				mapNode.fields.set(brand("prop1"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schema, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a second valid number node
				mapNode.fields.set(brand("prop2"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schema, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`mapNode not in schema if nodes are not allowed by field`, () => {
				const fieldSchema_requiredNumberNode = fieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const fieldSchema_requiredStringNode = fieldSchema(FieldKinds.required, [
					stringNode.type,
				]);
				const mapNodeSchema = new MapNodeStoredSchema(fieldSchema_requiredNumberNode);
				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				};
				const schemaPolicy = {
					fieldKinds: new Map([
						[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
						[fieldSchema_requiredStringNode.kind, FieldKinds.required],
					]),
				};

				// In schema with one number node
				const mapNode = createMapNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);
				assert.equal(
					isNodeInSchema(mapNode, mapNodeSchema, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// Not in schema after adding a string node
				mapNode.fields.set(brand("prop2"), [stringNode]);
				assert.equal(
					isNodeInSchema(mapNode, mapNodeSchema, schemaCollection, schemaPolicy),
					SchemaValidationErrors.UnknownError,
				);
			});
		});

		// describe("isFieldInSchema", () => {
		// 	const builder = new SchemaFactory("myScope");
		// 	const empty = builder.object("empty", {});
		// 	const valueField = builder.required(builder.number);
		// 	const structValue = builder.object("structValue", { x: valueField });
		// 	const optionalField = builder.optional(builder.number);
		// 	const structOptional = builder.object("structOptional", { x: optionalField });
		// 	const treeSchema = builder.number;
		// 	const view = getView(new TreeConfiguration(treeSchema, () => 1));

		// 	const schemaCollection: StoredSchemaCollection = {
		// 		nodeSchema: new Map([
		// 			[
		// 				brand<TreeNodeSchemaIdentifier>("myKey"),
		// 				new LeafNodeStoredSchema(ValueSchema.Number),
		// 			],
		// 		]), // TreeNodeSchemaIdentifier, TreeNodeStoredSchema;
		// 	};
		// 	const schemaPolicy: FullSchemaPolicy = {
		// 		fieldKinds: new Map(),
		// 	};

		// 	it("returns false is field kind is not handled by schema policy", () => {
		// 		const result = isFieldInSchema(childNodes, schema, schemaCollection, schemaPolicy);
		// 		assert.equal(result, false);
		// 	});
		// });
	});
});
