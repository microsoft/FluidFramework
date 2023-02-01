/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk";
import { TestField } from "../../cursorTestSuite";
import { jsonArray, jsonNull, jsonNumber, jsonObject } from "../../../domains";
import { brand, makeArray } from "../../../util";
import { EmptyKey, FieldKey } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { dummyRoot } from "../../../feature-libraries/chunked-forest";

export const emptyShape = new TreeShape(jsonNull.name, false, []);

export const xField: FieldKey = brand("x");
export const yField: FieldKey = brand("y");

const numberShape = new TreeShape(jsonNumber.name, true, []);
const withChildShape = new TreeShape(jsonObject.name, false, [[xField, numberShape, 1]]);
const pointShape = new TreeShape(jsonObject.name, false, [
	[xField, numberShape, 1],
	[yField, numberShape, 1],
]);

const sides = 100000;
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
					x: [{ type: jsonNumber.name, value: index * 2 }],
					y: [{ type: jsonNumber.name, value: index * 2 + 1 }],
				},
			})),
		},
	},
} as const;

const testTrees = [
	{
		name: "number",
		dataFactory: () => new UniformChunk(numberShape.withTopLevelLength(1), [5]),
		reference: [{ type: jsonNumber.name, value: 5 }],
	},
	{
		name: "root sequence",
		dataFactory: () => new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
		reference: [
			{ type: jsonNumber.name, value: 1 },
			{ type: jsonNumber.name, value: 2 },
			{ type: jsonNumber.name, value: 3 },
		],
	},
	{
		name: "child sequence",
		dataFactory: () =>
			new UniformChunk(
				new TreeShape(jsonArray.name, false, [
					[EmptyKey, numberShape, 3],
				]).withTopLevelLength(1),
				[1, 2, 3],
			),
		reference: [
			{
				type: jsonArray.name,
				fields: {
					[EmptyKey]: [
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
						{ type: jsonNumber.name, value: 3 },
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
					x: [{ type: jsonNumber.name, value: 1 }],
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
					x: [{ type: jsonNumber.name, value: 1 }],
					y: [{ type: jsonNumber.name, value: 2 }],
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
