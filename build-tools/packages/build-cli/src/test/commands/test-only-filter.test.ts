/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package } from "@fluidframework/build-tools";
import { runCommand } from "@oclif/test";
import chai, { assert, expect } from "chai";
import assertArrays from "chai-arrays";
import { describe, it } from "mocha";

chai.use(assertArrays);

interface jsonOutput {
	selected: Package[];
	filtered: Package[];
}

describe("flub test-only-filter", () => {
	it(`--all selector`, async () => {
		const { stdout } = await runCommand(["test-only-filter", "--quiet", "--json", "--all"], {
			root: import.meta.url,
		});
		const output: jsonOutput = JSON.parse(stdout) as jsonOutput;
		const { selected, filtered } = output;
		expect(selected).to.be.ofSize(filtered.length);
	});

	it(`--dir selector`, async () => {
		const { stdout } = await runCommand(
			["test-only-filter", "--quiet", "--json", "--dir", "."],
			{ root: import.meta.url },
		);
		const output: jsonOutput = JSON.parse(stdout) as jsonOutput;
		const { selected, filtered } = output;
		expect(selected.length).to.equal(1);
		expect(filtered.length).to.equal(1);

		const pkg = filtered[0];

		assert(pkg !== undefined);
		expect(pkg.name).to.equal("@fluid-tools/build-cli");
		expect(pkg.directory).to.equal("build-tools/packages/build-cli");
	});

	it(`--releaseGroup selector`, async () => {
		const { stdout } = await runCommand(
			["test-only-filter", "--quiet", "--json", "--releaseGroup", "build-tools"],
			{ root: import.meta.url },
		);
		const output: jsonOutput = JSON.parse(stdout) as jsonOutput;
		const { selected, filtered } = output;
		expect(selected.length).to.equal(5);
		expect(filtered.length).to.equal(5);
	});

	it(`--private filter`, async () => {
		const { stdout } = await runCommand(
			["test-only-filter", "--quiet", "--json", "--all", "--private"],
			{ root: import.meta.url },
		);
		const output: jsonOutput = JSON.parse(stdout) as jsonOutput;
		const { filtered } = output;

		const names = filtered.map((p) => p.name);
		expect(names).to.be.containing("@fluid-private/changelog-generator-wrapper");
		expect(names).to.be.containing("@fluid-example/example-utils");
	});

	it(`--no-private filter`, async () => {
		const { stdout } = await runCommand(
			["test-only-filter", "--quiet", "--json", "--all", "--no-private"],
			{ root: import.meta.url },
		);
		const output: jsonOutput = JSON.parse(stdout) as jsonOutput;
		const { filtered } = output;

		const names = filtered.map((p) => p.name);
		expect(names).not.to.be.containing("@fluid-private/changelog-generator-wrapper");
	});

	it(`--scope filter`, async () => {
		const { stdout } = await runCommand(
			["test-only-filter", "--quiet", "--json", "--all", "--skipScope", "@fluidframework"],
			{ root: import.meta.url },
		);
		const output: jsonOutput = JSON.parse(stdout) as jsonOutput;
		const { filtered } = output;

		const names = filtered.map((p) => p.name);
		[
			"@fluid-private/changelog-generator-wrapper",
			"@fluid-tools/build-cli",
			"fluid-framework",
			// eslint-disable-next-line unicorn/no-array-for-each
		].forEach((item) => {
			expect(names).to.be.containing(item);
		});
	});
});
