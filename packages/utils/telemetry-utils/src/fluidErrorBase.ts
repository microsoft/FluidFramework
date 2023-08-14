/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidErrorBase } from "@fluidframework/core-interfaces";

const hasTelemetryPropFunctions = (x: any): boolean =>
	typeof x?.getTelemetryProperties === "function" &&
	typeof x?.addTelemetryProperties === "function";

export const hasErrorInstanceId = (x: any): x is { errorInstanceId: string } =>
	typeof x?.errorInstanceId === "string";

/** type guard for IFluidErrorBase interface */
export function isFluidError(e: any): e is IFluidErrorBase {
	return (
		typeof e?.errorType === "string" &&
		typeof e?.message === "string" &&
		hasErrorInstanceId(e) &&
		hasTelemetryPropFunctions(e)
	);
}

/** type guard for old standard of valid/known errors */
export function isValidLegacyError(e: any): e is Omit<IFluidErrorBase, "errorInstanceId"> {
	return (
		typeof e?.errorType === "string" &&
		typeof e?.message === "string" &&
		hasTelemetryPropFunctions(e)
	);
}
