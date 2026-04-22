/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import { tokenizeFilter } from "../../commands/pnpm-run.js";

describe("flub pnpm-run", () => {
	describe("tokenizeFilter", () => {
		it("defaults to -r when input is empty", () => {
			expect(tokenizeFilter("")).to.deep.equal(["-r"]);
		});

		it("defaults to -r when input is whitespace only", () => {
			expect(tokenizeFilter("   ")).to.deep.equal(["-r"]);
		});

		it("splits a single double-quoted filter into two tokens", () => {
			expect(tokenizeFilter('--filter "@fluidframework/map..."')).to.deep.equal([
				"--filter",
				"@fluidframework/map...",
			]);
		});

		it("splits multiple double-quoted filters preserving each pattern", () => {
			expect(
				tokenizeFilter('--filter "@fluidframework/map..." --filter "@fluidframework/tree..."'),
			).to.deep.equal([
				"--filter",
				"@fluidframework/map...",
				"--filter",
				"@fluidframework/tree...",
			]);
		});

		it("handles unquoted filter values", () => {
			expect(tokenizeFilter("--filter @fluidframework/map")).to.deep.equal([
				"--filter",
				"@fluidframework/map",
			]);
		});

		it("handles single-quoted values", () => {
			expect(tokenizeFilter("--filter '@foo/bar'")).to.deep.equal(["--filter", "@foo/bar"]);
		});
	});
});
