/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import { simpleGit } from "simple-git";
import { DEFAULT_CHANGESET_PATH, canonicalizeChangesets } from "../../library/changesets.js";

describe("canonicalizeChangesets", () => {
	let testDir: string;
	let changesetDir: string;
	let git: ReturnType<typeof simpleGit>;

	/**
	 * Helper to write a changeset file and commit it to git
	 */
	async function writeChangesetFile(filename: string, content: string): Promise<void> {
		const filePath = path.join(changesetDir, filename);
		await writeFile(filePath, content);
		// Git operations are relative to testDir, not changesetDir
		await git.add(path.join(DEFAULT_CHANGESET_PATH, filename));
		await git.commit(`Add changeset ${filename}`);
	}

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "changeset-test-"));
		changesetDir = path.join(testDir, DEFAULT_CHANGESET_PATH);
		await mkdir(changesetDir, { recursive: true });

		// Initialize git repo (required by loadChangesets)
		git = simpleGit(testDir);
		await git.init();
		await git.addConfig("user.name", "Test User");
		await git.addConfig("user.email", "test@example.com");
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("should throw error when no changesets exist", async () => {
		await assert.rejects(async () => canonicalizeChangesets(testDir), /No changesets found/);
	});

	it("should determine major as highest bump type", async () => {
		await writeChangesetFile(
			"major-change.md",
			'---\n"@fluid/package-a": major\n---\n\nMajor breaking change\n\nDetailed description of the breaking change.\n',
		);
		await writeChangesetFile(
			"minor-change.md",
			'---\n"@fluid/package-b": minor\n---\n\nMinor feature\n\nDetailed description of the feature.\n',
		);

		const bumpType = await canonicalizeChangesets(testDir);
		assert.strictEqual(bumpType, "major");
	});

	it("should determine minor as highest bump type when no major", async () => {
		await writeChangesetFile(
			"minor-change.md",
			'---\n"@fluid/package-a": minor\n---\n\nMinor feature\n\nDetailed description of the feature.\n',
		);
		await writeChangesetFile(
			"patch-change.md",
			'---\n"@fluid/package-b": patch\n---\n\nBug fix\n\nDetailed description of the fix.\n',
		);

		const bumpType = await canonicalizeChangesets(testDir);
		assert.strictEqual(bumpType, "minor");
	});

	it("should determine patch as bump type when only patch changes", async () => {
		await writeChangesetFile(
			"patch-change.md",
			'---\n"@fluid/package-a": patch\n---\n\nBug fix\n\nDetailed description of the fix.\n',
		);

		const bumpType = await canonicalizeChangesets(testDir);
		assert.strictEqual(bumpType, "patch");
	});

	it("should strip metadata starting with double underscore", async () => {
		const changesetPath = path.join(changesetDir, "with-metadata.md");
		await writeChangesetFile(
			"with-metadata.md",
			'---\n"@fluid/package-a": minor\n"__highlight": true\n"__section": "legacy"\n---\n\nA change with custom metadata\n\nDetailed body text.\n',
		);

		await canonicalizeChangesets(testDir);

		const content = await readFile(changesetPath, "utf8");
		assert.match(content, /"@fluid\/package-a": minor/);
		assert.doesNotMatch(content, /__highlight/);
		assert.doesNotMatch(content, /__section/);
	});

	it("should preserve changeset summary and body", async () => {
		const changesetPath = path.join(changesetDir, "with-body.md");
		const summary = "This is the summary line";
		const body = "This is the detailed body text\nWith multiple lines";

		await writeChangesetFile(
			"with-body.md",
			`---\n"@fluid/package-a": patch\n---\n\n${summary}\n\n${body}\n`,
		);

		await canonicalizeChangesets(testDir);

		const content = await readFile(changesetPath, "utf8");
		assert.match(content, new RegExp(summary));
		const firstBodyLine = body.split("\n")[0];
		if (firstBodyLine !== undefined) {
			assert.match(content, new RegExp(firstBodyLine));
		}
	});

	it("should handle multi-package changesets", async () => {
		const changesetPath = path.join(changesetDir, "multi-package.md");
		await writeChangesetFile(
			"multi-package.md",
			'---\n"@fluid/package-a": major\n"@fluid/package-b": minor\n"@fluid/package-c": patch\n---\n\nMulti-package change\n\nDetailed description of the multi-package change.\n',
		);

		const bumpType = await canonicalizeChangesets(testDir);

		assert.strictEqual(bumpType, "major");
		const content = await readFile(changesetPath, "utf8");
		assert.match(content, /"@fluid\/package-a": major/);
		assert.match(content, /"@fluid\/package-b": minor/);
		assert.match(content, /"@fluid\/package-c": patch/);
	});

	it("should process multiple changeset files", async () => {
		await writeChangesetFile(
			"change-1.md",
			'---\n"@fluid/package-a": minor\n---\n\nFirst change\n\nDetailed description.\n',
		);
		await writeChangesetFile(
			"change-2.md",
			'---\n"@fluid/package-b": patch\n---\n\nSecond change\n\nDetailed description.\n',
		);
		await writeChangesetFile(
			"change-3.md",
			'---\n"@fluid/package-c": minor\n---\n\nThird change\n\nDetailed description.\n',
		);

		const bumpType = await canonicalizeChangesets(testDir);

		assert.strictEqual(bumpType, "minor");

		// Verify all files were processed
		const content1 = await readFile(path.join(changesetDir, "change-1.md"), "utf8");
		const content2 = await readFile(path.join(changesetDir, "change-2.md"), "utf8");
		const content3 = await readFile(path.join(changesetDir, "change-3.md"), "utf8");

		assert.match(content1, /"@fluid\/package-a": minor/);
		assert.match(content2, /"@fluid\/package-b": patch/);
		assert.match(content3, /"@fluid\/package-c": minor/);
	});

	it("should handle changesets with only custom metadata stripped", async () => {
		const changesetPath = path.join(changesetDir, "only-custom.md");
		await writeChangesetFile(
			"only-custom.md",
			'---\n"@fluid/package-a": patch\n"__highlight": true\n---\n\nChange with highlight\n\nDetailed description.\n',
		);

		await canonicalizeChangesets(testDir);

		const content = await readFile(changesetPath, "utf8");
		assert.match(content, /"@fluid\/package-a": patch/);
		assert.doesNotMatch(content, /__highlight/);
		assert.match(content, /Change with highlight/);
	});

	it("should preserve formatting of YAML frontmatter", async () => {
		const changesetPath = path.join(changesetDir, "formatted.md");
		await writeChangesetFile(
			"formatted.md",
			'---\n"@fluid/package-a": minor\n---\n\nFormatted change\n\nBody content\n',
		);

		await canonicalizeChangesets(testDir);

		const content = await readFile(changesetPath, "utf8");
		assert.match(content, /^---\n/);
		assert.match(content, /\n---\n/);
	});

	it("should handle changesets with mixed metadata", async () => {
		const changesetPath = path.join(changesetDir, "mixed.md");
		await writeChangesetFile(
			"mixed.md",
			'---\n"@fluid/package-a": major\n"__highlight": true\n"@fluid/package-b": minor\n"__section": "breaking"\n---\n\nMixed metadata change\n\nDetailed description.\n',
		);

		await canonicalizeChangesets(testDir);

		const content = await readFile(changesetPath, "utf8");
		assert.match(content, /"@fluid\/package-a": major/);
		assert.match(content, /"@fluid\/package-b": minor/);
		assert.doesNotMatch(content, /__highlight/);
		assert.doesNotMatch(content, /__section/);
	});

	it("should write all changesets in parallel", async () => {
		// Create multiple changesets
		const writePromises: Promise<void>[] = [];
		for (let i = 0; i < 10; i++) {
			writePromises.push(
				writeChangesetFile(
					`change-${i}.md`,
					`---\n"@fluid/package-${i}": patch\n"__custom": "metadata"\n---\n\nChange ${i}\n\nDetailed description.\n`,
				),
			);
		}
		await Promise.all(writePromises);

		await canonicalizeChangesets(testDir);

		// Verify all were processed (custom metadata stripped)
		const readPromises: Promise<void>[] = [];
		for (let i = 0; i < 10; i++) {
			readPromises.push(
				readFile(path.join(changesetDir, `change-${i}.md`), "utf8").then((content) => {
					assert.doesNotMatch(content, /__custom/);
					assert.match(content, new RegExp(`Change ${i}`));
				}),
			);
		}
		await Promise.all(readPromises);
	});

	it("should throw error when directory doesn't have git repo", async () => {
		// Create a directory without git init
		const noGitDir = await mkdtemp(path.join(tmpdir(), "no-git-"));
		const noGitChangesetDir = path.join(noGitDir, DEFAULT_CHANGESET_PATH);
		await mkdir(noGitChangesetDir, { recursive: true });

		// Create a changeset file so we get past the "no changesets" check
		await writeFile(
			path.join(noGitChangesetDir, "test.md"),
			'---\n"@fluid/package-a": patch\n---\n\nTest change\n\nDetailed description.\n',
		);

		try {
			await assert.rejects(
				async () => canonicalizeChangesets(noGitDir),
				/Cannot use simple-git|not a git repository/,
			);
		} finally {
			await rm(noGitDir, { recursive: true, force: true });
		}
	});
});
