/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import { runPolicyHandler } from "../../../commands/check/policy.js";
import type { Handler } from "../../../library/repoPolicyCheck/index.js";

describe("check:policy", () => {
	it("reports a handler that throws as a policy failure", async () => {
		const throwingHandler: Handler = {
			name: "throwing-policy-test",
			match: /package\.json$/i,
			handler: async () => {
				throw new Error("boom");
			},
		};

		const { handler, result } = await runPolicyHandler(throwingHandler, "package.json", ".");

		expect(handler).to.equal(throwingHandler);
		expect(result).to.equal("boom");
	});
});
