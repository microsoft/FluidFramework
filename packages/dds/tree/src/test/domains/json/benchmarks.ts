/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursor, forEachField, forEachNode } from "../../../core/index.js";
import { JsonCompatibleReadOnly, JsonCompatibleReadOnlyObject } from "../../../util/index.js";

export function sum(cursor: ITreeCursor): number {
	let total = 0;
	const value = cursor.value;
	if (typeof value === "number") {
		total += value;
	}

	for (let inField = cursor.firstField(); inField; inField = cursor.nextField()) {
		for (let inNode = cursor.firstNode(); inNode; inNode = cursor.nextNode()) {
			total += sum(cursor);
		}
	}

	return total;
}

export function sumMap(cursor: ITreeCursor): number {
	let total = 0;
	const value = cursor.value;
	if (typeof value === "number") {
		total += value;
	}

	forEachField(cursor, () =>
		forEachNode(cursor, (c) => {
			total += sumMap(c);
		}),
	);

	return total;
}

export function sumDirect(
	jsonObj: JsonCompatibleReadOnlyObject | readonly JsonCompatibleReadOnly[],
): number {
	let total = 0;
	for (const value of Object.values(jsonObj)) {
		if (typeof value === "object" && value !== null) {
			total += sumDirect(value);
		} else if (typeof value === "number") {
			total += value;
		}
	}
	return total;
}

/**
 * Benchmarking "consumer" that calculates averages of values.
 * This takes a callback which enables this benchmark to be used with any shape of tree since the callback defines the tree navigation.
 * @param cursor - a Shared Tree cursor
 * @param dataConsumer - Function that should use the given cursor to retrieve data and call calculate().
 * @returns average of values passed to callback.
 * @remarks
 * This is useful to help ensure an optimizer does not optimize out parts of the benchmark
 * by computing something using the data retrieved in the benchmark.
 */
export function averageValues<T>(
	cursor: T,
	dataConsumer: (cursor: T, calculate: (x: number) => void) => void,
): number {
	let count = 0;
	let xTotal = 0;

	const calculate = (x: number) => {
		count += 1;
		xTotal += x;
	};

	dataConsumer(cursor, calculate);

	return xTotal / count;
}
