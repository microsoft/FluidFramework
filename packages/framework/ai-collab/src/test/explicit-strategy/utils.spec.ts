/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { UsageError, isFluidError } from "@fluidframework/telemetry-utils/internal";

describe("Type guards", () => {
	// Although isFluidError should give us a guarentee of catching UsageError,
	// this test gives one more layer of protection in case this logic changes.
	it("isFluidError returns true for UsageError", () => {
		assert(isFluidError(new UsageError("test")));
	});
});
