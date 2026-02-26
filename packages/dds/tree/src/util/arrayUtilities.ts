/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Validates that the provided index is a safe integer.
 * @throws If the index is invalid.
 * @param index - The index to validate.
 * @param apiName - The name of the API performing the validation.
 * @throws If the index is invalid.
 */
export function validateSafeInteger(index: number, apiName: string): void {
	if (!Number.isSafeInteger(index)) {
		throw new UsageError(`Expected a safe integer passed to ${apiName}, got ${index}.`);
	}
}

/**
 * Validates that the provided index is a 0 or greater safe integer.
 * @param index - The index to validate.
 * @param apiName - The name of the API performing the validation.
 * @throws If the index is invalid.
 */
export function validatePositiveIndex(index: number, apiName: string): void {
	validateSafeInteger(index, apiName);
	if (index < 0) {
		throw new UsageError(`Expected non-negative index passed to ${apiName}, got ${index}.`);
	}
}

/**
 * Validates that the provided index is a non-negative safe integer within the bounds of the provided array (or, optionally, 1 past its end).
 * @throws If the index is invalid.
 * @param index - The index to validate.
 * @param array - The array to validate against.
 * @param apiName - The name of the API performing the validation.
 * @param allowOnePastEnd - Whether to allow the index to be one past the end of the array.
 */
export function validateIndex(
	index: number,
	array: { readonly length: number },
	apiName: string,
	allowOnePastEnd: boolean = false,
): void {
	validatePositiveIndex(index, apiName);
	if (allowOnePastEnd) {
		if (index > array.length) {
			throw new UsageError(
				`Index value passed to ${apiName} is out of bounds. Expected at most ${array.length}, got ${index}.`,
			);
		}
	} else {
		if (index >= array.length) {
			throw new UsageError(
				`Index value passed to ${apiName} is out of bounds. Expected at most ${array.length - 1}, got ${index}.`,
			);
		}
	}
}

/**
 * Validates that the provided range `[startIndex, endIndex)` is valid and within the bounds of the provided array.
 * @remarks
 * This is intended for ranges which are inclusive for the lower bound, and exclusive for the upper bound,
 * and permits 0 length ranges, even `[array.length, array.length)`.
 * @throws If the index is invalid.
 * @param startIndex - The index that starts the range (inclusive).
 * @param endIndex - The index that ends the range (exclusive).
 * @param array - The array to validate against.
 * @param apiName - The name of the API performing the validation.
 */
export function validateIndexRange(
	startIndex: number,
	endIndex: number,
	array: { readonly length: number },
	apiName: string,
): void {
	if (startIndex > endIndex) {
		throw new UsageError(
			`Malformed range passed to ${apiName}. Start index ${startIndex} is greater than end index ${endIndex}.`,
		);
	}
	validateIndex(startIndex, array, apiName, true);
	validateIndex(endIndex, array, apiName, true);
}
