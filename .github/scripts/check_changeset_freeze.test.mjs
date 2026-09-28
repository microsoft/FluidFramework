import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ChangesetFreezeError, checkChangesetFreeze } from "./check_changeset_freeze.mjs";

function git(repoPath, ...args) {
	return execFileSync("git", args, {
		cwd: repoPath,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function write(repoPath, filePath, contents) {
	const fullPath = path.join(repoPath, filePath);
	mkdirSync(path.dirname(fullPath), { recursive: true });
	writeFileSync(fullPath, contents);
}

function writeConfig(repoPath, directory, currentVersion, lockedVersion) {
	const configPath = path.join(directory, ".changeset", "config.json");
	write(
		repoPath,
		configPath,
		`${JSON.stringify(
			{
				__fluidChangesetState: {
					currentVersion,
					lockedVersion,
				},
			},
			undefined,
			"\t",
		)}\n`,
	);
}

function commit(repoPath, message) {
	git(repoPath, "add", "-A");
	git(repoPath, "commit", "-m", message);
	return git(repoPath, "rev-parse", "HEAD");
}

function createRepo(t, groups) {
	const repoPath = mkdtempSync(path.join(tmpdir(), "changeset-freeze-"));
	t.after(() => rmSync(repoPath, { force: true, recursive: true }));
	git(repoPath, "init", "--initial-branch=main");
	git(repoPath, "config", "user.name", "Changeset Freeze Test");
	git(repoPath, "config", "user.email", "changeset-freeze@example.com");

	for (const group of groups) {
		writeConfig(repoPath, group.directory, group.currentVersion, group.lockedVersion);
		write(repoPath, path.join(group.directory, ".changeset", "README.md"), "Changesets\n");
		for (const [fileName, contents] of Object.entries(group.changesets ?? {})) {
			write(repoPath, path.join(group.directory, ".changeset", fileName), contents);
		}
	}

	return repoPath;
}

test("allows changeset modifications when the state is open", (t) => {
	const repoPath = createRepo(t, [
		{ directory: "", currentVersion: "next", lockedVersion: "previous" },
	]);
	const baseRef = commit(repoPath, "base");
	write(repoPath, ".changeset/new-change.md", "new change\n");
	const headRef = commit(repoPath, "add changeset");

	assert.doesNotThrow(() => checkChangesetFreeze({ repoPath, baseRef, headRef }));
});

for (const operation of ["add", "edit", "rename", "delete"]) {
	test(`blocks a changeset ${operation} when the state is frozen`, (t) => {
		const repoPath = createRepo(t, [
			{
				directory: "",
				currentVersion: "next",
				lockedVersion: "next",
				changesets: { "existing-change.md": "existing change\n" },
			},
		]);
		const baseRef = commit(repoPath, "base");

		switch (operation) {
			case "add":
				write(repoPath, ".changeset/new-change.md", "new change\n");
				break;
			case "edit":
				write(repoPath, ".changeset/existing-change.md", "edited change\n");
				break;
			case "rename":
				renameSync(
					path.join(repoPath, ".changeset", "existing-change.md"),
					path.join(repoPath, ".changeset", "renamed-change.md"),
				);
				break;
			case "delete":
				rmSync(path.join(repoPath, ".changeset", "existing-change.md"));
				break;
		}

		const headRef = commit(repoPath, `${operation} changeset`);
		assert.throws(
			() => checkChangesetFreeze({ repoPath, baseRef, headRef }),
			(error) =>
				error instanceof ChangesetFreezeError &&
				error.message.includes("Changesets cannot be modified") &&
				error.message.includes(".changeset/"),
		);
	});
}

test("ignores README and config changes while frozen", (t) => {
	const repoPath = createRepo(t, [
		{ directory: "", currentVersion: "3.4.0", lockedVersion: "3.4.0" },
	]);
	const baseRef = commit(repoPath, "base");
	write(repoPath, ".changeset/README.md", "Updated documentation\n");
	writeConfig(repoPath, "", "3.5.0", "3.4.0");
	const headRef = commit(repoPath, "update state and docs");

	assert.doesNotThrow(() => checkChangesetFreeze({ repoPath, baseRef, headRef }));
});

test("allows the release-notes PR to consume changesets and activate the freeze", (t) => {
	const repoPath = createRepo(t, [
		{
			directory: "",
			currentVersion: "3.4.0",
			lockedVersion: "3.3.0",
			changesets: { "release-change.md": "release change\n" },
		},
	]);
	const baseRef = commit(repoPath, "base");
	rmSync(path.join(repoPath, ".changeset", "release-change.md"));
	writeConfig(repoPath, "", "3.4.0", "3.4.0");
	const headRef = commit(repoPath, "generate release notes");

	assert.doesNotThrow(() => checkChangesetFreeze({ repoPath, baseRef, headRef }));
});

test("allows the version-bump PR to reopen changesets without modifying them", (t) => {
	const repoPath = createRepo(t, [
		{ directory: "", currentVersion: "3.4.0", lockedVersion: "3.4.0" },
	]);
	const baseRef = commit(repoPath, "base");
	writeConfig(repoPath, "", "3.5.0", "3.4.0");
	const headRef = commit(repoPath, "bump version");

	assert.doesNotThrow(() => checkChangesetFreeze({ repoPath, baseRef, headRef }));
});

test("isolates freeze state by changeset directory", (t) => {
	const repoPath = createRepo(t, [
		{
			directory: "",
			currentVersion: "3.4.0",
			lockedVersion: "3.4.0",
			changesets: { "client-change.md": "client change\n" },
		},
		{
			directory: "server/routerlicious",
			currentVersion: "8.0.0",
			lockedVersion: "7.0.0",
			changesets: { "server-change.md": "server change\n" },
		},
	]);
	const baseRef = commit(repoPath, "base");
	write(repoPath, "server/routerlicious/.changeset/server-change.md", "edited server change\n");
	const openGroupHead = commit(repoPath, "edit server changeset");
	assert.doesNotThrow(() => checkChangesetFreeze({ repoPath, baseRef, headRef: openGroupHead }));

	write(repoPath, ".changeset/client-change.md", "edited client change\n");
	const frozenGroupHead = commit(repoPath, "edit client changeset");
	assert.throws(
		() => checkChangesetFreeze({ repoPath, baseRef, headRef: frozenGroupHead }),
		(error) =>
			error instanceof ChangesetFreezeError &&
			error.message.includes(".changeset/client-change.md") &&
			!error.message.includes("server-change.md"),
	);
});

for (const [name, mutateConfig, expectedMessage] of [
	[
		"missing field",
		(config) => {
			delete config.__fluidChangesetState.lockedVersion;
		},
		"must define currentVersion and lockedVersion",
	],
	[
		"non-string current version",
		(config) => {
			config.__fluidChangesetState.currentVersion = 34;
		},
		"currentVersion must be a string",
	],
	[
		"non-string locked version",
		(config) => {
			config.__fluidChangesetState.lockedVersion = 34;
		},
		"lockedVersion must be null or a string",
	],
]) {
	test(`fails for ${name}`, (t) => {
		const repoPath = createRepo(t, [
			{ directory: "", currentVersion: "3.4.0", lockedVersion: null },
		]);
		const configPath = path.join(repoPath, ".changeset", "config.json");
		const config = JSON.parse(readFileSync(configPath, "utf8"));
		mutateConfig(config);
		writeFileSync(configPath, `${JSON.stringify(config, undefined, "\t")}\n`);
		const baseRef = commit(repoPath, "base");
		write(repoPath, "README.md", "unrelated change\n");
		const headRef = commit(repoPath, "head");

		assert.throws(
			() => checkChangesetFreeze({ repoPath, baseRef, headRef }),
			(error) =>
				error instanceof ChangesetFreezeError && error.message.includes(expectedMessage),
		);
	});
}
