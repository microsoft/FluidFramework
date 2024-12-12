/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Params } from "express-serve-static-core";

export function getParam(params: Params, key: string) {
	return Array.isArray(params) ? undefined : params[key];
}

/**
 * Helper function to convert Request's query param to a number.
 * @param value - The value to be converted to number.
 */
export function queryParamToNumber(value: any): number | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const parsedValue = parseInt(value, 10);
	return isNaN(parsedValue) ? undefined : parsedValue;
}

/**
 * Helper function to convert Request's query param to a string.
 * @param value - The value to be converted to number.
 */
export function queryParamToString(value: any): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	return value;
}
