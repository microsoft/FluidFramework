/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { isFluidError, type IFluidErrorBase } from "@fluidframework/telemetry-utils/internal";

/**
 * Helper that returns whether the provided error is a usage error. There are more than one implementations of
 * UsageError, so checking for "instanceOf UsageError" in end to end tests can yield in incorrect behavior. This
 * function is agnostic of the implementation of UsageError and checks for the errorType instead.
 *
 *
 * @internal
 */
export function isUsageError(error: unknown): error is IFluidErrorBase {
	return isFluidError(error) && error.errorType === FluidErrorTypes.usageError;
}
