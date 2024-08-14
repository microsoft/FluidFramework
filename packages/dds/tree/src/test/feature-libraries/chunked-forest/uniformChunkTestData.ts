/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EmptyKey, type FieldKey } from "../../../core/index.js";
import { jsonArray, jsonObject, leaf } from "../../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { dummyRoot } from "../../../feature-libraries/chunked-forest/index.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import { brand, makeArray } from "../../../util/index.js";
import { type TestField, EmptyObject } from "../../cursorTestSuite.js";

export const emptyShape = new TreeShape(brand(EmptyObject.identifier), false, []);

export const xField: FieldKey = brand("x");
export const yField: FieldKey = brand("y");

const numberShape = new TreeShape(leaf.number.name, true, []);
const withChildShape = new TreeShape(jsonObject.name, false, [[xField, numberShape, 1]]);
const pointShape = new TreeShape(jsonObject.name, false, [
	[xField, numberShape, 1],
	[yField, numberShape, 1],
]);

const sides = 100;
const polygon = new TreeShape(jsonArray.name, false, [
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
		type: jsonArray.name,
		fields: {
			[EmptyKey]: makeArray(sides, (index) => ({
				type: jsonObject.name,
				fields: {
					x: [{ type: leaf.number.name, value: index * 2 }],
					y: [{ type: leaf.number.name, value: index * 2 + 1 }],
				},
			})),
		},
	},
} as const;

const testTrees = [
	{
		name: "number",
		dataFactory: () => new UniformChunk(numberShape.withTopLevelLength(1), [5]),
		reference: [{ type: leaf.number.name, value: 5 }],
	},
	{
		name: "root sequence",
		dataFactory: () => new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
		reference: [
			{ type: leaf.number.name, value: 1 },
			{ type: leaf.number.name, value: 2 },
			{ type: leaf.number.name, value: 3 },
		],
	},
	{
		name: "child sequence",
		dataFactory: () =>
			new UniformChunk(
				new TreeShape(jsonArray.name, false, [[EmptyKey, numberShape, 3]]).withTopLevelLength(
					1,
				),
				[1, 2, 3],
			),
		reference: [
			{
				type: jsonArray.name,
				fields: {
					[EmptyKey]: [
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
						{ type: leaf.number.name, value: 3 },
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
				type: jsonObject.name,
				fields: {
					x: [{ type: leaf.number.name, value: 1 }],
				},
			},
		],
	},
	{
		name: "point",
		dataFactory: () => new UniformChunk(pointShape.withTopLevelLength(1), [1, 2]),
		reference: [
			{
				type: jsonObject.name,
				fields: {
					x: [{ type: leaf.number.name, value: 1 }],
					y: [{ type: leaf.number.name, value: 2 }],
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
