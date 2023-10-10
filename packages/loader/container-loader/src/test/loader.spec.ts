/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { isFluidError } from "@fluidframework/telemetry-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces";
import { Loader } from "../loader";

describe("loader unit test", () => {
	it("rehydrateDetachedContainerFromSnapshot with invalid format", async () => {
		const failProxy = <T extends object>() => {
			return new Proxy<T>({} as any as T, {
				get: () => {
					throw Error("not implemented");
				},
			});
		};

		const loader = new Loader({
			codeLoader: failProxy(),
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
		});

		try {
			await loader.rehydrateDetachedContainerFromSnapshot(`{"foo":"bar"}`);
			assert.fail("should fail");
		} catch (e) {
			assert.strict(isFluidError(e), `should be a fluid error: ${e}`);
			assert.strictEqual(e.errorType, FluidErrorTypes.usageError, "should be a usage error");
		}
	});
});
