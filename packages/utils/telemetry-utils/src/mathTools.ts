/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Function to round a number to a specified number of decimal places.
 *
 * @param number - The number to round.
 * @param decimalPlaces - The number of decimal places to round to.
 * @returns The rounded number.
 */
export function roundToDecimalPlaces(number: number, decimalPlaces: number): number {
	const factor = Math.pow(10, decimalPlaces);
	return Math.round(number * factor) / factor;
}
