/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "@oclif/test";
import { expect } from "chai";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

// Mimic the behavior of running the command from the package root.
const workingDirectory = Path.resolve(dirname, "..", "..", "..");

describe("lint-api-model Command", () => {
	it("Errors on empty API model", async () => {
		const { error } = await runCommand(
			`lint-api-model src/test/test-data/empty-model -w ${workingDirectory}`,
		);
		expect(error).to.not.be.undefined;
		console.log(error?.message);
		expect(error?.message).to.contain("Error loading API model");
	});

	it("Errors on API Model containing invalid reference tags", async () => {
		const { error } = await runCommand(
			`lint-api-model src/test/test-data/simple-suite-test -w ${workingDirectory}`,
		);
		expect(error).to.not.be.undefined;
		console.log(error?.message);
		expect(error?.message).to.equal(`Found 3 errors in the API model:
  Reference errors:
    The following reference tags could not be resolved:
      test-suite-a:
      - {@link InvalidItem} on "" could not be resolved.
      - {@link InvalidItem | even though I link to an invalid item, I would still like this text to be rendered} on "" could not be resolved.
      - {@inheritDoc BadInheritDocTarget} on "TestInterface.propertyWithBadInheritDocTarget" could not be resolved.
`);
	});
});
