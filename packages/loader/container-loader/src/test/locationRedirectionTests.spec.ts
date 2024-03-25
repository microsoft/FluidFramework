/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { DriverErrorTypes, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { resolveWithLocationRedirectionHandling } from "../location-redirection-utilities/index.js";

describe("Location Redirection Handling Tests", () => {
	it("Should handle/retry location redirection error", async () => {
		let turn = 0;
		const resolved: IResolvedUrl = {
			type: "fluid",
			url: "fluidUrl",
			endpoints: {},
			id: "test",
			tokens: {},
		};
		const urlResolver: IUrlResolver = {
			resolve: async (request: IRequest) => {
				return resolved;
			},
			getAbsoluteUrl: async (resolvedUrl: IResolvedUrl, relativeUrl: string) => {
				return "newRequestUrl";
			},
		};
		const api = async (request: IRequest) => {
			// Throw error first time.
			if (turn === 0) {
				turn += 1;
				const error = new Error("Location Redirection");
				(error as any).errorType = DriverErrorTypes.locationRedirection;
				resolved.url = "RedirectedUrl";
				(error as any).redirectUrl = resolved;
				throw error;
			}
			assert.strictEqual(request.url, "newRequestUrl", "New req url should be set");
			return true;
		};
		const result = await resolveWithLocationRedirectionHandling<boolean>(
			api,
			{ url: "testUrl", headers: {} },
			urlResolver,
		);
		assert(result, "Should succeed with location redirection");
		assert.strictEqual(resolved.url, "RedirectedUrl", "Redirected location should be set");
	});
});
