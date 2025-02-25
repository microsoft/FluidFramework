/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EmptyKey, type FieldKey, type JsonableTree } from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { dummyRoot } from "../../../feature-libraries/chunked-forest/index.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import { numberSchema } from "../../../simple-tree/index.js";
import { brand, makeArray } from "../../../util/index.js";
import { type TestField, EmptyObject } from "../../cursorTestSuite.js";
import { JsonArray, JsonObject } from "../../../jsonDomainSchema.js";

export const emptyShape = new TreeShape(brand(EmptyObject.identifier), false, []);

export const xField: FieldKey = brand("x");
export const yField: FieldKey = brand("y");

const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
const withChildShape = new TreeShape(brand(JsonObject.identifier), false, [
	[xField, numberShape, 1],
]);
const pointShape = new TreeShape(brand(JsonObject.identifier), false, [
	[xField, numberShape, 1],
	[yField, numberShape, 1],
]);

const sides = 100;
const polygon = new TreeShape(brand(JsonArray.identifier), false, [
	[EmptyKey, pointShape, sides],
]).withTopLevelLength(1);

export const polygonTree = {
	name: "polygon",
	dataFactory: () =>
		new UniformChunk(
			polygon,
			makeArray(sides * 2, (index) => index),
		),
	reference: {
		type: brand(JsonArray.identifier),
		fields: {
			[EmptyKey]: makeArray(sides, (index) => ({
				type: brand(JsonObject.identifier),
				fields: {
					x: [{ type: brand(numberSchema.identifier), value: index * 2 }],
					y: [{ type: brand(numberSchema.identifier), value: index * 2 + 1 }],
				},
			})),
		},
	} satisfies JsonableTree,
} as const;

const testTrees: {
	name: string;
	dataFactory: () => UniformChunk;
	reference: JsonableTree[];
}[] = [
	{
		name: "number",
		dataFactory: () => new UniformChunk(numberShape.withTopLevelLength(1), [5]),
		reference: [{ type: brand(numberSchema.identifier), value: 5 }],
	},
	{
		name: "root sequence",
		dataFactory: () => new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
		reference: [
			{ type: brand(numberSchema.identifier), value: 1 },
			{ type: brand(numberSchema.identifier), value: 2 },
			{ type: brand(numberSchema.identifier), value: 3 },
		],
	},
	{
		name: "child sequence",
		dataFactory: () =>
			new UniformChunk(
				new TreeShape(brand(JsonArray.identifier), false, [
					[EmptyKey, numberShape, 3],
				]).withTopLevelLength(1),
				[1, 2, 3],
			),
		reference: [
			{
				type: brand(JsonArray.identifier),
				fields: {
					[EmptyKey]: [
						{ type: brand(numberSchema.identifier), value: 1 },
						{ type: brand(numberSchema.identifier), value: 2 },
						{ type: brand(numberSchema.identifier), value: 3 },
					],
				},
			},
		],
	},
	{
		name: "withChild",
		dataFactory: () => new UniformChunk(withChildShape.withTopLevelLength(1), [1]),
		reference: [
			{
				type: brand(JsonObject.identifier),
				fields: {
					x: [{ type: brand(numberSchema.identifier), value: 1 }],
				},
			},
		],
	},
	{
		name: "point",
		dataFactory: () => new UniformChunk(pointShape.withTopLevelLength(1), [1, 2]),
		reference: [
			{
				type: brand(JsonObject.identifier),
				fields: {
					x: [{ type: brand(numberSchema.identifier), value: 1 }],
					y: [{ type: brand(numberSchema.identifier), value: 2 }],
				},
			},
		],
	},
	{
		...polygonTree,
		reference: [polygonTree.reference],
	},
];

export const testData: readonly TestField<UniformChunk>[] = testTrees.map(
	({ name, dataFactory, reference }) => {
		return {
			name,
			dataFactory,
			reference,
			path: { parent: undefined, field: dummyRoot },
		};
	},
);
