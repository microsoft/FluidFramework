/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import { assertSafeAliasSelection } from "../../commands/ai.js";

describe("ai command", () => {
	it("allows known agent aliases", () => {
		for (const alias of ["claude", "dev", "copilot", "oce", "ai-reset"]) {
			expect(() =>
				assertSafeAliasSelection({ alias, explanation: `launch ${alias}` }),
			).to.not.throw();
		}
	});

	it("rejects unsupported aliases", () => {
		expect(() =>
			assertSafeAliasSelection({ alias: "bash", explanation: "definitely not safe" }),
		).to.throw(/Unsupported AI alias selection: bash/);
	});
});
