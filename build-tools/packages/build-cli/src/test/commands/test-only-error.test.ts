/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { describe, it } from "mocha";

describe("flub test-only-error", () => {
	it("exits with an error under --quiet", async () => {
		const { error } = await runCommand(["test-only-error", "--quiet"], {
			root: import.meta.url,
		});

		expect(error?.oclif?.exit).to.equal(1);
		expect(error?.message).to.include("Intentional test error.");
	});
});
