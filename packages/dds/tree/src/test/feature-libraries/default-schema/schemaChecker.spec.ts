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
import {
	FieldKinds,
	type FlexFieldKind,
	type FullSchemaPolicy,
} from "../../../feature-libraries/index.js";
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
	type TreeNodeStoredSchema,
	type Value,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import type { IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";

/**
 * A fake FluidHandle to be used in tests.
 * It's completely non-functional other than the `IFluidHandle` property, which is required
 * for the validations that SharedTree does on a FluidHandle value in a node.
 */
class TestFluidHandle implements IFluidHandle {
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

/**
 * Helper for building {@link TreeFieldStoredSchema}.
 */
function getFieldSchema(
	kind: { identifier: FieldKindIdentifier },
	allowedTypes?: Iterable<TreeNodeSchemaIdentifier>,
): TreeFieldStoredSchema {
	return {
		kind: kind.identifier,
		types: allowedTypes === undefined ? undefined : new Set(allowedTypes),
	};
}

function getValueNode(nodeSchemaIdentifier: string, value: Value): MapTree {
	return {
		type: brand(nodeSchemaIdentifier),
		value,
		fields: new Map(),
	};
}
function getMapNode(nodeSchemaIdentifier: string, fields: Map<FieldKey, MapTree[]>): MapTree {
	return {
		type: brand(nodeSchemaIdentifier),
		value: undefined,
		fields,
	};
}

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
		describe("LeafNodeStoredSchema", () => {
			const numberNode = getValueNode("myNumberNode", 1);
			const stringNode = getValueNode("myStringNode", "string");
			const booleanNode = getValueNode("myBooleanNode", false);
			const nullNode = getValueNode("myNullNode", null);
			const undefinedNode = getValueNode("myUndefinedNode", undefined);
			const fluidHandleNode = getValueNode("myFluidHandleNode", new TestFluidHandle());
			const nodeCases = [
				numberNode,
				stringNode,
				booleanNode,
				nullNode,
				fluidHandleNode,
				undefinedNode,
			];

			// Making the key of the record a ValueSchema ensures that we'll get compile-time errors if we add new
			// ValueSchema values but forget to add test cases for them.
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
						const title = expectedResult === SchemaValidationErrors.NoError ? "in schema" : "not in schema";
						it(`${node.type} is ${title}`, () => {
							const schemaCollection: StoredSchemaCollection = {
								nodeSchema: new Map([[node.type, testCaseData.schema]]),
							};
							assert.equal(
								isNodeInSchema(node, schemaCollection, emptySchemaPolicy),
								expectedResult,
							);
						});
					}
				});
			}

			it(`not in schema due to missing schema entry in schemaCollection`, () => {
				assert.equal(
					isNodeInSchema(numberNode, emptySchemaCollection, emptySchemaPolicy),
					SchemaValidationErrors.NodeSchemaNotInSchemaCollection,
				);
			});

			it(`not in schema due to having fields`, () => {
				const numberNodeWithFields = getValueNode("myNumberNodeWithFields", 1);
				const schemaCollection: StoredSchemaCollection = {
					nodeSchema: new Map([
						[numberNodeWithFields.type, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				};
				numberNodeWithFields.fields.set(brand("prop1"), [stringNode]);
				assert.equal(
					isNodeInSchema(numberNodeWithFields, schemaCollection, emptySchemaPolicy),
					SchemaValidationErrors.LeafNodeWithFields,
				);
			});
		});

		describe("MapNodeStoredSchema", () => {
			const numberNode = getValueNode("myNumberNode", 1);
			const stringNode = getValueNode("myStringNode", "string");

			it(`not in schema due to missing schema entry in schemaCollection`, () => {
				// Schema for a map node whose fields are required and must contain a number.
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.type]);
				const schema = new MapNodeStoredSchema(fieldSchema);

				const schemaPolicy = {
					fieldKinds: new Map([[fieldSchema.kind, FieldKinds.required]]),
				};

				// numberNode.type is not in the schema collection
				const mapNode_oneNumber = getMapNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				assert.equal(
					isNodeInSchema(mapNode_oneNumber, emptySchemaCollection, schemaPolicy),
					SchemaValidationErrors.NodeSchemaNotInSchemaCollection,
				);
			});

			it(`not in schema due to missing FieldKind entry in schemaPolicy`, () => {
				// Schema for a map node whose fields are required and must contain a number.
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					getFieldSchema(FieldKinds.required, [numberNode.type]),
				);

				// numberNode.type is not in the schema collection
				const mapNode_oneNumber = getMapNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				const schemaCollection: StoredSchemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[mapNode_oneNumber.type, mapNodeSchema],
					]),
				};

				assert.equal(
					isNodeInSchema(mapNode_oneNumber, schemaCollection, emptySchemaPolicy),
					SchemaValidationErrors.FieldKindNotInSchemaPolicy,
				);
			});

			it(`mapNode with required fields of a single kind`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredNumberNode,
				);
				const mapNode = getMapNode("myNumberMapNode", new Map());
				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[mapNode.type, mapNodeSchema],
					]),
				};
				const schemaPolicy = {
					fieldKinds: new Map([
						[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
					]),
				};

				// In schema while empty
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a valid number node
				mapNode.fields.set(brand("prop1"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a second valid number node
				mapNode.fields.set(brand("prop2"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`mapNode not in schema if nodes are not allowed by field`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const fieldSchema_requiredStringNode = getFieldSchema(FieldKinds.required, [
					stringNode.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredNumberNode,
				);
				const mapNode = getMapNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[mapNode.type, mapNodeSchema],
					]),
				};
				const schemaPolicy = {
					fieldKinds: new Map([
						[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
						[fieldSchema_requiredStringNode.kind, FieldKinds.required],
					]),
				};

				// In schema with one number node
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// Not in schema after adding a string node
				mapNode.fields.set(brand("prop2"), [stringNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NodeTypeNotAllowedInField,
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

	describe("isFieldInSchema", () => {
		it(`fail if field kind not supported by schema policy`, () => {
			const numberNode = getValueNode("myNumberNode", 1);
			const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.type]);
			const schemaCollection = {
				nodeSchema: new Map([
					[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
				]),
			};

			// FieldKinds.required is used above but missing in the schema policy
			assert.equal(
				isFieldInSchema([numberNode], fieldSchema, schemaCollection, emptySchemaPolicy),
				SchemaValidationErrors.FieldKindNotInSchemaPolicy,
			);
		});

		it(`fail if type of a child node is not supported by field`, () => {
			const numberNode = getValueNode("myNumberNode", 1);
			const stringNode = getValueNode("myStringNode", "myStringValue");
			const fieldSchema = getFieldSchema(FieldKinds.sequence, [numberNode.type]);
			const schemaCollection = {
				nodeSchema: new Map([
					[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
				]),
			};
			const schemaPolicy = {
				fieldKinds: new Map([[fieldSchema.kind, FieldKinds.sequence]]),
			};

			// Confirm that the field supports number nodes
			assert.equal(
				isFieldInSchema([numberNode], fieldSchema, schemaCollection, schemaPolicy),
				SchemaValidationErrors.NoError,
			);

			// Field does not support string nodes
			assert.equal(
				isFieldInSchema([stringNode], fieldSchema, schemaCollection, schemaPolicy),
				SchemaValidationErrors.NodeTypeNotAllowedInField,
			);

			// Still fails even if there are other valid nodes for the field
			assert.equal(
				isFieldInSchema(
					[numberNode, stringNode, numberNode],
					fieldSchema,
					schemaCollection,
					schemaPolicy,
				),
				SchemaValidationErrors.NodeTypeNotAllowedInField,
			);
		});

		const isFieldInSchema_multiplicityTestCases: [
			kind: FlexFieldKind,
			numberToTest: number,
			expectedResult: SchemaValidationErrors,
		][] = [
			[FieldKinds.required, 0, SchemaValidationErrors.IncorrectMultiplicity],
			[FieldKinds.required, 1, SchemaValidationErrors.NoError],
			[FieldKinds.required, 2, SchemaValidationErrors.IncorrectMultiplicity],
			[FieldKinds.forbidden, 0, SchemaValidationErrors.NoError],
			[FieldKinds.forbidden, 1, SchemaValidationErrors.IncorrectMultiplicity],
			[FieldKinds.optional, 0, SchemaValidationErrors.NoError],
			[FieldKinds.optional, 1, SchemaValidationErrors.NoError],
			[FieldKinds.optional, 2, SchemaValidationErrors.IncorrectMultiplicity],
			[FieldKinds.sequence, 0, SchemaValidationErrors.NoError],
			[FieldKinds.sequence, 1, SchemaValidationErrors.NoError],
			[FieldKinds.sequence, 2, SchemaValidationErrors.NoError],
			[FieldKinds.nodeKey, 0, SchemaValidationErrors.IncorrectMultiplicity],
			[FieldKinds.nodeKey, 1, SchemaValidationErrors.NoError],
			[FieldKinds.nodeKey, 2, SchemaValidationErrors.IncorrectMultiplicity],
		];
		for (const [
			fieldKind,
			howManyChildNodes,
			expectedResult,
		] of isFieldInSchema_multiplicityTestCases) {
			it(`correctly validates field multiplicity: (${fieldKind.identifier}, ${howManyChildNodes}) => ${expectedResult}`, () => {
				const numberNode = getValueNode("myNumberNode", 1);
				const fieldSchema = getFieldSchema(fieldKind, [numberNode.type]);
				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				};
				const schemaPolicy = {
					fieldKinds: new Map([[fieldSchema.kind, fieldKind]]),
				};
				const childNodes: MapTree[] = [];
				for (let i = 0; i < howManyChildNodes; i++) {
					childNodes.push(numberNode);
				}

				assert.equal(
					isFieldInSchema(childNodes, fieldSchema, schemaCollection, schemaPolicy),
					expectedResult,
				);
			});
		}
	});
});
