/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Validates that the error is a UsageError with the expected error message.
 */
export function validateUsageError(expectedErrorMsg: string | RegExp): (error: Error) => true {
	return (error: Error) => {
		assert(error instanceof UsageError);
		if (
			typeof expectedErrorMsg === "string"
				? error.message !== expectedErrorMsg
				: !expectedErrorMsg.test(error.message)
		) {
			throw new Error(
				`Unexpected assertion thrown\nActual: ${error.message}\nExpected: ${expectedErrorMsg}`,
			);
		}
		return true;
	};
}
