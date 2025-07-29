/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type nconf from "nconf";

/**
 * @internal
 */
export function getBooleanFromConfig(name: string, config: nconf.Provider): boolean {
	const rawValue = config.get(name);

	if (typeof rawValue === "boolean") {
		return rawValue;
	} else if (typeof rawValue === "string") {
		return rawValue.toLowerCase() === "true";
	} else {
		return false;
	}
}

/**
 * @internal
 */
export function getNumberFromConfig(name: string, config: nconf.Provider): number {
	const rawValue = config.get(name);
	if (typeof rawValue === "number") {
		return rawValue;
	} else if (typeof rawValue === "string") {
		return Number(rawValue);
	} else {
		return NaN;
	}
}
