/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import {
	findTopLevelBlock,
	insertLexicographically,
	pathMatchesPattern,
} from "../../../library/repoPolicyCheck/pipelineTriggerPaths.js";

describe("pipeline-trigger-paths", () => {
	describe("pathMatchesPattern", () => {
		it("matches an exact file", () => {
			expect(pathMatchesPattern("a/b/c.yml", "a/b/c.yml")).to.equal(true);
		});

		it("matches a directory prefix", () => {
			expect(pathMatchesPattern("packages/foo/index.ts", "packages")).to.equal(true);
		});

		it("does not match an unrelated path", () => {
			expect(pathMatchesPattern("a/b/c.yml", "a/b/d.yml")).to.equal(false);
		});

		it("does not match a sibling path that shares a prefix string", () => {
			// `package` is a prefix string of `packages` but not a directory match.
			expect(pathMatchesPattern("packages/foo", "package")).to.equal(false);
		});

		it("matches single-level glob (dir/*)", () => {
			expect(pathMatchesPattern("patches/foo.patch", "patches/*")).to.equal(true);
		});

		it("does not match nested files under a single-level glob", () => {
			expect(pathMatchesPattern("patches/sub/foo.patch", "patches/*")).to.equal(false);
		});

		it("matches recursive glob (dir/**)", () => {
			expect(pathMatchesPattern("patches/sub/foo.patch", "patches/**")).to.equal(true);
		});

		it("strips a leading slash from the pattern", () => {
			expect(pathMatchesPattern("a/b.yml", "/a/b.yml")).to.equal(true);
		});
	});

	describe("insertLexicographically", () => {
		it("inserts items in sorted order relative to existing entries", () => {
			const result = insertLexicographically(["alpha", "delta", "echo"], ["bravo", "charlie"]);
			expect(result).to.deep.equal(["alpha", "bravo", "charlie", "delta", "echo"]);
		});

		it("appends items that sort after every existing entry", () => {
			const result = insertLexicographically(["alpha"], ["zeta", "yankee"]);
			expect(result).to.deep.equal(["alpha", "yankee", "zeta"]);
		});

		it("prepends items that sort before every existing entry", () => {
			const result = insertLexicographically(["mike", "november"], ["alpha", "bravo"]);
			expect(result).to.deep.equal(["alpha", "bravo", "mike", "november"]);
		});

		it("places hyphen-suffixed names before dotted ones (ASCII order)", () => {
			// Validates that a multi-segment name like 'foo-bar.yml' sorts before 'foo.yml'
			// because '-' (0x2D) precedes '.' (0x2E).
			const result = insertLexicographically([], ["foo.yml", "foo-bar.yml"]);
			expect(result).to.deep.equal(["foo-bar.yml", "foo.yml"]);
		});

		it("does not reorder existing entries that are not sorted", () => {
			const result = insertLexicographically(["zebra", "alpha"], ["mike"]);
			// Existing relative order preserved; new item slots before the first greater entry.
			expect(result).to.deep.equal(["mike", "zebra", "alpha"]);
		});
	});

	describe("findTopLevelBlock", () => {
		it("returns 'missing' when the key is not present", () => {
			const content = `name: foo\nparameters: []\n`;
			expect(findTopLevelBlock(content, "trigger").kind).to.equal("missing");
		});

		it("returns 'none' when the key is set to none", () => {
			const content = `name: foo\ntrigger: none\npr:\n  branches:\n    include:\n    - main\n`;
			const block = findTopLevelBlock(content, "trigger");
			expect(block.kind).to.equal("none");
		});

		it("returns 'branchesOnly' when there are branches but no paths filter", () => {
			const content = `name: foo\ntrigger:\n  branches:\n    include:\n    - main\n`;
			const block = findTopLevelBlock(content, "trigger");
			expect(block.kind).to.equal("branchesOnly");
		});

		it("returns 'include' with the items when paths.include is present", () => {
			const content = [
				"name: foo",
				"trigger:",
				"  branches:",
				"    include:",
				"    - main",
				"  paths:",
				"    include:",
				"    - alpha.yml",
				"    - bravo.yml",
				"",
				"pr: none",
				"",
			].join("\n");
			const block = findTopLevelBlock(content, "trigger");
			expect(block.kind).to.equal("include");
			if (block.kind === "include") {
				expect(block.paths.items).to.deep.equal(["alpha.yml", "bravo.yml"]);
			}
		});

		it("ignores comment-only lines inside the include block", () => {
			const content = [
				"trigger:",
				"  paths:",
				"    include:",
				"    # a comment",
				"    - alpha.yml",
				"    # another comment",
				"    - bravo.yml",
			].join("\n");
			const block = findTopLevelBlock(content, "trigger");
			expect(block.kind).to.equal("include");
			if (block.kind === "include") {
				expect(block.paths.items).to.deep.equal(["alpha.yml", "bravo.yml"]);
			}
		});
	});
});
