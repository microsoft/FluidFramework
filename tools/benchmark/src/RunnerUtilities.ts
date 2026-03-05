/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "./assert.js";
import type { Measurement } from "./ResultTypes.js";

/**
 * This file contains generic utilities of use to a test reporter,
 * especially for convenient formatting of textual output to the command line.
 */

/**
 * Creates and returns a padding string consisting of `num` copies of `chr`
 * @param num - Number of characters to pad
 * @param chr - Character to use for padding (space by default)
 */
export const pad = (num: number, chr = " "): string => chr.repeat(num);

/**
 * Nicely format a decimal number to make it human-readable.
 * @param num - Number to format
 * @param numDecimals - Number of digits after the decimal point to retain
 */
export function prettyNumber(num: number, numDecimals = 3): string {
	// Split the string to determine parts before and after the decimal
	const split: string[] = num.toFixed(numDecimals).split(".");
	// Show exponential if we have more than 9 digits before the decimal
	if (split[0].length > 9) {
		return num.toExponential(numDecimals);
	}
	// Add commas to the numbers before the decimal.
	// Since this only ever runs on <= 9 characters, it's not a performance problem.
	split[0] = split[0].replace(/(\d)(?=(\d{3})+$)/g, "$1,");
	return split.join(".");
}

/**
 * Computes the geometric mean of a set of values.
 * Returns 0 if any value is non-positive.
 * @param values - The values to compute the geometric mean of.
 */
export function geometricMean(values: number[]): number {
	// Compute the geometric mean of values, but do it using log and exp to reduce overflow/underflow.
	let sum = 0;
	for (const value of values) {
		if (value <= 0) {
			return 0;
		}
		sum += Math.log(value);
	}
	return Math.exp(sum / values.length);
}

/**
 * Formats a measurement for display, including appropriate units and number formatting.
 * @param measurement - The measurement to format.
 * @remarks
 * This special cases several well known units.
 */
export function formatMeasurementValue(
	measurement: Measurement,
	scaleUnits: boolean = true,
): string {
	if (measurement.units === "count") {
		assert(Number.isInteger(measurement.value), "expected integer value for count measurement");
		return `${prettyNumber(measurement.value, 0)}`;
	}
	if (measurement.units === "bytes") {
		// For bytes, use binary prefixes
		const units = ["B", "KiB", "MiB", "GiB", "TiB"];
		let value = measurement.value;
		let unitIndex = 0;
		while (scaleUnits && Math.abs(value) >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex++;
		}
		return `${prettyNumber(value, 2)} ${units[unitIndex]}`;
	}
	if (measurement.units === "%") {
		return `${prettyNumber(measurement.value, 3)}%`;
	}
	if (measurement.units === "ns/op") {
		const units = ["ns", "ms", "s"];
		// Scaling factors between the above units
		const scale = [1e6, 1e3];
		let value = measurement.value;
		let unitIndex = 0;
		while (scaleUnits && Math.abs(value) >= scale[unitIndex] && unitIndex < units.length - 1) {
			value /= scale[unitIndex];
			unitIndex++;
		}
		let decimals = 1;
		if (scaleUnits) {
			decimals = Math.abs(value) > 1000 ? 0 : 2;
		}
		return `${prettyNumber(value, decimals)} ${units[unitIndex]}/op`;
	}

	return `${prettyNumber(measurement.value)}${measurement.units ? ` ${measurement.units}` : ""}`;
}
