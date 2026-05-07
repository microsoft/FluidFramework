/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import {
	analyzePipeline,
	type FileReader,
	findIncludedTemplates,
	findTopLevelBlock,
	insertLexicographically,
	pathMatchesPattern,
} from "../../../library/repoPolicyCheck/pipelineTriggerPaths.js";

/**
 * Builds a `FileReader` backed by an in-memory map keyed by absolute path. Tests use
 * this to drive the pipeline analysis without scaffolding files on disk. Throws on
 * lookup of an unmapped path, matching the production contract for missing files.
 */
function makeReader(files: Record<string, string>): FileReader {
	const map = new Map<string, string>(Object.entries(files));
	return (absPath) => {
		const content = map.get(absPath);
		if (content === undefined) {
			throw new Error(`ENOENT: no such file or directory, open '${absPath}'`);
		}
		return content;
	};
}

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

	describe("findIncludedTemplates", () => {
		const repoRoot = "/repo";
		const root = "/repo/tools/pipelines/main.yml";

		it("resolves a leading-slash @self reference under repoRoot", () => {
			const reader = makeReader({
				[root]: [
					"trigger:",
					"  paths:",
					"    include:",
					"    - x",
					"extends:",
					"  template: /tools/pipelines/templates/include-vars.yml@self",
				].join("\n"),
				"/repo/tools/pipelines/templates/include-vars.yml": "# leaf\n",
			});

			const { parents, unresolved } = findIncludedTemplates(root, repoRoot, reader);

			expect([...unresolved]).to.deep.equal([]);
			expect([...parents.keys()]).to.deep.equal([
				root,
				"/repo/tools/pipelines/templates/include-vars.yml",
			]);
			expect(parents.get("/repo/tools/pipelines/templates/include-vars.yml")).to.equal(root);
		});

		it("resolves a relative-path @self reference relative to the including file", () => {
			const reader = makeReader({
				[root]: "extends:\n  template: ../shared/leaf.yml@self\n",
				"/repo/tools/shared/leaf.yml": "# leaf\n",
			});

			const { parents, unresolved } = findIncludedTemplates(root, repoRoot, reader);

			expect([...unresolved]).to.deep.equal([]);
			expect(parents.has("/repo/tools/shared/leaf.yml")).to.equal(true);
		});

		it("skips references to non-self repository resources", () => {
			const reader = makeReader({
				[root]: [
					"resources:",
					"  repositories:",
					"    - repository: m365Pipelines",
					"extends:",
					"  template: v1/M365.Official.PipelineTemplate.yml@m365Pipelines",
				].join("\n"),
			});

			const { parents, unresolved } = findIncludedTemplates(root, repoRoot, reader);

			// Only the root file is recorded; the external template is ignored entirely.
			expect([...parents.keys()]).to.deep.equal([root]);
			expect([...unresolved]).to.deep.equal([]);
		});

		it("records BFS parent pointers for shortest inclusion chains", () => {
			// main → A → C, main → B (C is reachable via A only). main also references C
			// directly later — the direct edge wins because BFS visits the root first.
			const reader = makeReader({
				[root]: ["extends:", "  template: /a.yml@self", "  template: /b.yml@self"].join("\n"),
				"/repo/a.yml": "template: /c.yml@self\n",
				"/repo/b.yml": "# leaf\n",
				"/repo/c.yml": "# leaf\n",
			});

			const { parents } = findIncludedTemplates(root, repoRoot, reader);

			expect(parents.get(root)).to.equal(undefined);
			expect(parents.get("/repo/a.yml")).to.equal(root);
			expect(parents.get("/repo/b.yml")).to.equal(root);
			expect(parents.get("/repo/c.yml")).to.equal("/repo/a.yml");
		});

		it("throws with parent context when the target file does not exist", () => {
			const reader = makeReader({
				[root]: "extends:\n  template: /tools/pipelines/templates/missing.yml@self\n",
			});

			expect(() => findIncludedTemplates(root, repoRoot, reader))
				.to.throw(Error)
				.with.property("message")
				.that.matches(/missing\.yml/)
				.and.matches(/referenced from/);
		});

		it("reports an unresolved reference for variable-interpolated paths", () => {
			const reader = makeReader({
				[root]: "extends:\n  template: ${{ variables.fooTemplate }}@self\n",
			});

			const { unresolved } = findIncludedTemplates(root, repoRoot, reader);

			expect([...unresolved]).to.have.lengthOf(1);
			expect([...unresolved][0]).to.include("variable interpolation");
		});
	});

	describe("analyzePipeline", () => {
		const repoRoot = "/repo";
		const pipeline = "/repo/tools/pipelines/main.yml";
		const leaf = "/repo/tools/pipelines/templates/leaf.yml";

		it("flags missing entries in trigger.paths.include with chain-formatted messages", () => {
			const reader = makeReader({
				[pipeline]: [
					"trigger:",
					"  branches:",
					"    include:",
					"    - main",
					"  paths:",
					"    include:",
					"    - tools/pipelines/main.yml",
					"pr:",
					"  branches:",
					"    include:",
					"    - main",
					"  paths:",
					"    include:",
					"    - tools/pipelines/main.yml",
					"    - tools/pipelines/templates/leaf.yml",
					"extends:",
					"  template: /tools/pipelines/templates/leaf.yml@self",
				].join("\n"),
				[leaf]: "# leaf\n",
			});

			const analysis = analyzePipeline(pipeline, repoRoot, reader);

			expect(analysis.issues).to.have.lengthOf(1);
			expect(analysis.issues[0]).to.include("trigger.paths.include");
			expect(analysis.issues[0]).to.include("main.yml → leaf.yml");
		});

		it("flags a missing top-level section when templates are referenced", () => {
			const reader = makeReader({
				[pipeline]: [
					"trigger:",
					"  branches:",
					"    include:",
					"    - main",
					"  paths:",
					"    include:",
					"    - tools/pipelines/main.yml",
					"    - tools/pipelines/templates/leaf.yml",
					"extends:",
					"  template: /tools/pipelines/templates/leaf.yml@self",
				].join("\n"),
				[leaf]: "# leaf\n",
			});

			const analysis = analyzePipeline(pipeline, repoRoot, reader);

			expect(analysis.issues).to.have.lengthOf(1);
			expect(analysis.issues[0]).to.equal("Missing top-level 'pr:' section.");
		});

		it("does not flag pipelines whose triggers cover every reachable file", () => {
			const reader = makeReader({
				[pipeline]: [
					"trigger:",
					"  branches:",
					"    include:",
					"    - main",
					"  paths:",
					"    include:",
					"    - tools/pipelines/main.yml",
					"    - tools/pipelines/templates/leaf.yml",
					"pr:",
					"  branches:",
					"    include:",
					"    - main",
					"  paths:",
					"    include:",
					"    - tools/pipelines/main.yml",
					"    - tools/pipelines/templates/leaf.yml",
					"extends:",
					"  template: /tools/pipelines/templates/leaf.yml@self",
				].join("\n"),
				[leaf]: "# leaf\n",
			});

			const analysis = analyzePipeline(pipeline, repoRoot, reader);

			expect(analysis.issues).to.deep.equal([]);
		});

		it("does not flag pipelines that reference no templates", () => {
			// No `template:` references and no trigger blocks: nothing to enforce.
			const reader = makeReader({ [pipeline]: "name: foo\n" });

			const analysis = analyzePipeline(pipeline, repoRoot, reader);

			expect(analysis.issues).to.deep.equal([]);
		});

		it("respects 'trigger: none' / 'pr: none' as an explicit opt-out", () => {
			const reader = makeReader({
				[pipeline]: [
					"trigger: none",
					"pr: none",
					"extends:",
					"  template: /tools/pipelines/templates/leaf.yml@self",
				].join("\n"),
				[leaf]: "# leaf\n",
			});

			const analysis = analyzePipeline(pipeline, repoRoot, reader);

			expect(analysis.issues).to.deep.equal([]);
		});

		it("treats a branches-only block as already covering every path", () => {
			const reader = makeReader({
				[pipeline]: [
					"trigger:",
					"  branches:",
					"    include:",
					"    - main",
					"pr:",
					"  branches:",
					"    include:",
					"    - main",
					"extends:",
					"  template: /tools/pipelines/templates/leaf.yml@self",
				].join("\n"),
				[leaf]: "# leaf\n",
			});

			const analysis = analyzePipeline(pipeline, repoRoot, reader);

			expect(analysis.issues).to.deep.equal([]);
		});
	});
});
