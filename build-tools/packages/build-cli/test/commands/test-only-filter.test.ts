/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package } from "@fluidframework/build-tools";
import chai, { expect } from "chai";
import assertArrays from "chai-arrays";

import { initializeCommandTestFunction } from "../init.js";

const test = initializeCommandTestFunction(import.meta.url);
chai.use(assertArrays);

interface jsonOutput {
	selected: Package[];
	filtered: Package[];
}

describe("flub test-only-filter", () => {
	test
		.stdout()
		.command(["test-only-filter", "--quiet", "--json", "--all"])
		.it(`--all selector`, (ctx) => {
			const output: jsonOutput = JSON.parse(ctx.stdout);
			const { selected, filtered } = output;
			expect(selected.length).to.equal(filtered.length);
		});

	test
		.stdout()
		.command(["test-only-filter", "--quiet", "--json", "--dir", "."])
		.it(`--dir selector`, (ctx) => {
			const output: jsonOutput = JSON.parse(ctx.stdout);
			const { selected, filtered } = output;
			expect(selected).to.be.ofSize(1);
			expect(filtered).to.be.ofSize(1);

			const pkg = filtered[0];

			expect(pkg.name).to.equal("@fluid-tools/build-cli");
			expect(pkg.directory).to.equal("build-tools/packages/build-cli");
		});

	test
		.stdout()
		.command(["test-only-filter", "--quiet", "--json", "--releaseGroup", "build-tools"])
		.it(`--releaseGroup selector`, (ctx) => {
			const output: jsonOutput = JSON.parse(ctx.stdout);
			const { selected, filtered } = output;
			expect(selected).to.be.ofSize(5);
			expect(filtered).to.be.ofSize(5);
		});

	test
		.stdout()
		.command(["test-only-filter", "--quiet", "--json", "--all", "--private"])
		.it(`--private filter`, (ctx) => {
			const output: jsonOutput = JSON.parse(ctx.stdout);
			const { filtered } = output;

			const names = filtered.map((p) => p.name);
			expect(names).to.be.containingAllOf([
				"@fluid-private/readme-command",
				"@fluid-example/example-utils",
			]);
		});

	test
		.stdout()
		.command(["test-only-filter", "--quiet", "--json", "--all", "--no-private"])
		.it(`--no-private filter`, (ctx) => {
			const output: jsonOutput = JSON.parse(ctx.stdout);
			const { filtered } = output;

			const names = filtered.map((p) => p.name);
			expect(names).to.not.be.containingAnyOf(["@fluid-private/readme-command"]);
		});

	test
		.stdout()
		.command([
			"test-only-filter",
			"--quiet",
			"--json",
			"--all",
			"--skipScope",
			"@fluidframework",
		])
		.it(`--scope filter`, (ctx) => {
			const output: jsonOutput = JSON.parse(ctx.stdout);
			const { filtered } = output;

			const names = filtered.map((p) => p.name);
			expect(names).to.be.containingAllOf([
				"@fluid-private/readme-command",
				"@fluid-tools/build-cli",
				"fluid-framework",
			]);
		});
});
