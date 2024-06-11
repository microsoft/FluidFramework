/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Function to truncate a number to a specified number of decimal places.
 *
 * @param number - The number to truncate.
 * @param decimalPlaces - The number of decimal places to truncate to.
 * @returns The truncated number.
 */
export function truncateToDecimalPlaces(number: number, decimalPlaces: number): number {
	const factor = Math.pow(10, decimalPlaces);
	return Math.trunc(number * factor) / factor;
}
