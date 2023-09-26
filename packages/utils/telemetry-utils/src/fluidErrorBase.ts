/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/core-interfaces";

/**
 * An error emitted by the Fluid Framework.
 *
 * @remarks
 *
 * All normalized errors flowing through the Fluid Framework adhere to this readonly interface.
 *
 * It features the members of {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error | Error}
 * made readonly, as well as  {@link IFluidErrorBase.errorType} and {@link IFluidErrorBase.errorInstanceId}.
 * It also features getters and setters for telemetry props to be included when the error is logged.
 */
export interface IFluidErrorBase extends Error {
	/**
	 * Classification of what type of error this is.
	 *
	 * @remarks Used programmatically by consumers to interpret the error.
	 */
	readonly errorType: string;

	/**
	 * Error's message property, made readonly.
	 *
	 * @remarks
	 *
	 * Recommendations:
	 *
	 * Be specific, but also take care when including variable data to consider suitability for aggregation in telemetry.
	 * Also avoid including any data that jeopardizes the user's privacy. Add a tagged telemetry property instead.
	 */
	readonly message: string;

	/**
	 * See {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack}.
	 */
	readonly stack?: string;

	/**
	 * See {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/name}.
	 */
	readonly name: string;

	/**
	 * A Guid identifying this error instance.
	 *
	 * @remarks
	 *
	 * Useful in telemetry for deduplicating multiple logging events arising from the same error,
	 * or correlating an error with an inner error that caused it, in case of error wrapping.
	 */
	readonly errorInstanceId: string;

	/**
	 * Get the telemetry properties stashed on this error for logging.
	 */
	getTelemetryProperties(): ITelemetryProperties;

	/**
	 * Add telemetry properties to this error which will be logged with the error
	 */
	addTelemetryProperties: (props: ITelemetryProperties) => void;
}

const hasTelemetryPropFunctions = (x: unknown): boolean =>
	typeof (x as Partial<IFluidErrorBase>)?.getTelemetryProperties === "function" &&
	typeof (x as Partial<IFluidErrorBase>)?.addTelemetryProperties === "function";

/**
 * Type guard for error data containing the {@link IFluidErrorBase.errorInstanceId} property.
 */
export const hasErrorInstanceId = (x: unknown): x is { errorInstanceId: string } =>
	typeof (x as Partial<{ errorInstanceId: string }>)?.errorInstanceId === "string";

/**
 * Type guard for {@link IFluidErrorBase}.
 */
export function isFluidError(error: unknown): error is IFluidErrorBase {
	return (
		typeof (error as Partial<IFluidErrorBase>)?.errorType === "string" &&
		typeof (error as Partial<IFluidErrorBase>)?.message === "string" &&
		hasErrorInstanceId(error) &&
		hasTelemetryPropFunctions(error)
	);
}

/**
 * Type guard for old standard of valid/known errors.
 */
export function isValidLegacyError(
	error: unknown,
): error is Omit<IFluidErrorBase, "errorInstanceId"> {
	return (
		typeof (error as Partial<IFluidErrorBase>)?.errorType === "string" &&
		typeof (error as Partial<IFluidErrorBase>)?.message === "string" &&
		hasTelemetryPropFunctions(error)
	);
}
