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
	ObjectNodeStoredSchema,
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

function getObjectNode(nodeSchemaIdentifier: string, fields: Map<FieldKey, MapTree[]>): MapTree {
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
			const testCases = {
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
			} satisfies Record<ValueSchema, unknown>;

			for (const [key, testCaseData] of Object.entries(testCases)) {
				describe(`ValueSchema.${ValueSchema[parseInt(key, 10)]}`, () => {
					for (const node of nodeCases) {
						const expectedResult =
							testCaseData.positiveNodeType === node
								? SchemaValidationErrors.NoError
								: SchemaValidationErrors.LeafNode_InvalidValue;
						const title =
							expectedResult === SchemaValidationErrors.NoError
								? "in schema"
								: "not in schema";
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
					SchemaValidationErrors.Node_MissingSchema,
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
					SchemaValidationErrors.LeafNode_FieldsNotAllowed,
				);
			});
		});

		describe("MapNodeStoredSchema", () => {
			const numberNode = getValueNode("myNumberNode", 1);
			const stringNode = getValueNode("myStringNode", "string");
			const booleanNode = getValueNode("myBooleanNode", false);

			it(`in schema (nodes of a single type)`, () => {
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

				// In schema after adding a number node
				mapNode.fields.set(brand("prop1"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`in schema (nodes of several types)`, () => {
				const fieldSchema_requiredUnionNode = getFieldSchema(FieldKinds.required, [
					numberNode.type,
					stringNode.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredUnionNode,
				);
				const mapNode = getMapNode("myUnionMapNode", new Map());
				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[stringNode.type, new LeafNodeStoredSchema(ValueSchema.String)],
						[mapNode.type, mapNodeSchema],
					]),
				};
				const schemaPolicy = {
					fieldKinds: new Map([
						[fieldSchema_requiredUnionNode.kind, FieldKinds.required],
					]),
				};

				// In schema while empty
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a number node
				mapNode.fields.set(brand("prop1"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a string node
				mapNode.fields.set(brand("prop2"), [stringNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);
			});

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
					SchemaValidationErrors.Node_MissingSchema,
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
					SchemaValidationErrors.Field_KindNotInSchemaPolicy,
				);
			});

			it(`not in schema if nodes are not allowed by field`, () => {
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
					SchemaValidationErrors.Field_NodeTypeNotAllowed,
				);
			});
		});

		describe("ObjectNodeStoredSchema", () => {
			const numberNode = getValueNode("myNumberNode", 1);
			const stringNode = getValueNode("myStringNode", "string");
			const booleanNode = getValueNode("myBooleanNode", false);
			const nullNode = getValueNode("myNullNode", null);
			const fluidHandleNode = getValueNode("myFluidHandleNode", new TestFluidHandle());

			it(`in schema (children of every type)`, () => {
				const fieldSchema_optionalNumberNode = getFieldSchema(FieldKinds.optional, [
					numberNode.type,
				]);
				const fieldSchema_optionalStringNode = getFieldSchema(FieldKinds.optional, [
					stringNode.type,
				]);
				const fieldSchema_optionalBooleanNode = getFieldSchema(FieldKinds.optional, [
					booleanNode.type,
				]);
				const fieldSchema_optionalNullNode = getFieldSchema(FieldKinds.optional, [
					nullNode.type,
				]);
				const fieldSchema_optionalFluidHandleNode = getFieldSchema(FieldKinds.optional, [
					fluidHandleNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([
						[brand("numberProp"), fieldSchema_optionalNumberNode],
						[brand("stringProp"), fieldSchema_optionalStringNode],
						[brand("booleanProp"), fieldSchema_optionalBooleanNode],
						[brand("nullProp"), fieldSchema_optionalNullNode],
						[brand("fluidHandleProp"), fieldSchema_optionalFluidHandleNode],
					]),
				);
				const objectNode = getObjectNode("myObjectNode", new Map());
				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[stringNode.type, new LeafNodeStoredSchema(ValueSchema.String)],
						[booleanNode.type, new LeafNodeStoredSchema(ValueSchema.Boolean)],
						[nullNode.type, new LeafNodeStoredSchema(ValueSchema.Null)],
						[fluidHandleNode.type, new LeafNodeStoredSchema(ValueSchema.FluidHandle)],
						[objectNode.type, nodeSchema_object],
					]),
				};
				const schemaPolicy = {
					fieldKinds: new Map([
						[fieldSchema_optionalNumberNode.kind, FieldKinds.optional],
						[fieldSchema_optionalStringNode.kind, FieldKinds.optional],
						[fieldSchema_optionalBooleanNode.kind, FieldKinds.optional],
						[fieldSchema_optionalNullNode.kind, FieldKinds.optional],
						[fieldSchema_optionalFluidHandleNode.kind, FieldKinds.optional],
					]),
				};

				// Not in schema before the node has any fields defined (thus doesn't match the schema)
				assert.equal(
					isNodeInSchema(objectNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.ObjectNode_FieldCountMismatch,
				);

				// In schema after setting fields of all kinds to empty
				objectNode.fields.set(brand("numberProp"), []);
				objectNode.fields.set(brand("stringProp"), []);
				objectNode.fields.set(brand("booleanProp"), []);
				objectNode.fields.set(brand("nullProp"), []);
				objectNode.fields.set(brand("fluidHandleProp"), []);
				assert.equal(
					isNodeInSchema(objectNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after setting fields of all kinds to values
				objectNode.fields.set(brand("numberProp"), [numberNode]);
				objectNode.fields.set(brand("stringProp"), [stringNode]);
				objectNode.fields.set(brand("booleanProp"), [booleanNode]);
				objectNode.fields.set(brand("nullProp"), [nullNode]);
				objectNode.fields.set(brand("fluidHandleProp"), [fluidHandleNode]);
				assert.equal(
					isNodeInSchema(objectNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);

				// Still in schema after setting fields of all kinds to empty again
				objectNode.fields.set(brand("numberProp"), []);
				objectNode.fields.set(brand("stringProp"), []);
				objectNode.fields.set(brand("booleanProp"), []);
				objectNode.fields.set(brand("nullProp"), []);
				objectNode.fields.set(brand("fluidHandleProp"), []);
				assert.equal(
					isNodeInSchema(objectNode, schemaCollection, schemaPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`not in schema due to missing node schema entry in schemaCollection`, () => {
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.type]);
				const nodeSchema: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("prop1"), fieldSchema]]),
				);
				const schemaPolicy = {
					fieldKinds: new Map([[fieldSchema.kind, FieldKinds.required]]),
				};
				const objectNode = getObjectNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);
				// The object node's schema is missing in the collection
				const schemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				};

				assert.equal(
					isNodeInSchema(objectNode, emptySchemaCollection, schemaPolicy),
					SchemaValidationErrors.Node_MissingSchema,
				);
			});

			it(`not in schema due to missing FieldKind entry in schemaPolicy`, () => {
				const fieldSchema_requiredNumber = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("prop1"), fieldSchema_requiredNumber]]),
				);

				const objectNode = getObjectNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				const schemaCollection: StoredSchemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[objectNode.type, nodeSchema_object],
					]),
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaCollection, emptySchemaPolicy),
					SchemaValidationErrors.Field_KindNotInSchemaPolicy,
				);
			});

			it(`not in schema due to having a field not present in its defined schema`, () => {
				const fieldSchema_optionalNumber = getFieldSchema(FieldKinds.optional, [
					numberNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("prop1"), fieldSchema_optionalNumber]]),
				);

				// "prop2" is not a defined key in the object node schema
				const objectNode = getObjectNode("myObjectNode", new Map([[brand("prop2"), []]]));

				const schemaCollection: StoredSchemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[objectNode.type, nodeSchema_object],
					]),
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaCollection, emptySchemaPolicy),
					SchemaValidationErrors.ObjectNode_FieldNotInSchema,
				);
			});

			it(`not in schema due to not having all fields declared in its defined schema`, () => {
				const fieldSchema_optionalNumber = getFieldSchema(FieldKinds.optional, [
					numberNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([
						[brand("prop1"), fieldSchema_optionalNumber],
						[brand("prop2"), fieldSchema_optionalNumber],
					]),
				);

				// "prop1" is a valid field key, but "prop2" is missing
				const objectNode = getObjectNode("myObjectNode", new Map([[brand("prop1"), []]]));

				const schemaCollection: StoredSchemaCollection = {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						[objectNode.type, nodeSchema_object],
					]),
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaCollection, emptySchemaPolicy),
					SchemaValidationErrors.ObjectNode_FieldCountMismatch,
				);
			});
		});
	});

	describe("isFieldInSchema", () => {
		it(`not in schema if field kind not supported by schema policy`, () => {
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
				SchemaValidationErrors.Field_KindNotInSchemaPolicy,
			);
		});

		it(`not in schema if type of a child node is not supported by field`, () => {
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
				SchemaValidationErrors.Field_NodeTypeNotAllowed,
			);

			// Still fails even if there are other valid nodes for the field
			assert.equal(
				isFieldInSchema(
					[numberNode, stringNode, numberNode],
					fieldSchema,
					schemaCollection,
					schemaPolicy,
				),
				SchemaValidationErrors.Field_NodeTypeNotAllowed,
			);
		});

		const isFieldInSchema_multiplicityTestCases: [
			kind: FlexFieldKind,
			numberToTest: number,
			expectedResult: SchemaValidationErrors,
		][] = [
			[FieldKinds.required, 0, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.required, 1, SchemaValidationErrors.NoError],
			[FieldKinds.required, 2, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.forbidden, 0, SchemaValidationErrors.NoError],
			[FieldKinds.forbidden, 1, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.optional, 0, SchemaValidationErrors.NoError],
			[FieldKinds.optional, 1, SchemaValidationErrors.NoError],
			[FieldKinds.optional, 2, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.sequence, 0, SchemaValidationErrors.NoError],
			[FieldKinds.sequence, 1, SchemaValidationErrors.NoError],
			[FieldKinds.sequence, 2, SchemaValidationErrors.NoError],
			[FieldKinds.nodeKey, 0, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.nodeKey, 1, SchemaValidationErrors.NoError],
			[FieldKinds.nodeKey, 2, SchemaValidationErrors.Field_IncorrectMultiplicity],
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
