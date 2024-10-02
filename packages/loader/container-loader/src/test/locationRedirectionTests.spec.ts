/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IRequest } from "@fluidframework/core-interfaces";
import {
	IResolvedUrl,
	IUrlResolver,
	DriverErrorTypes,
} from "@fluidframework/driver-definitions/internal";

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
		const api = async (request: IRequest): Promise<boolean> => {
			// Throw error first time.
			if (turn === 0) {
				turn += 1;
				const error = new Error("Location Redirection");
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(error as any).errorType = DriverErrorTypes.locationRedirection;
				resolved.url = "RedirectedUrl";
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
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
