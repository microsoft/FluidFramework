/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	RESULTS_FILE_NAME,
	createResults,
	recordSuccess,
	recordWarning,
	writeStageResults,
	withResultsLock,
} from "./results.mjs";

test("writes a stage result without replacing prior stages", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-results-"));
	try {
		const results = createResults({ tenants: { source: { documents: ["document"] } } });
		recordSuccess(results, "source", "document");
		recordWarning(results, "source", "existing-document", {
			message: "The self-hosted document already exists",
		});
		await writeStageResults(directory, "document-copy", results);
		await writeStageResults(directory, "mongodb-data", { tenants: {} });
		const saved = JSON.parse(await readFile(path.join(directory, RESULTS_FILE_NAME), "utf8"));
		assert.deepEqual(saved.stages["document-copy"].tenants.source.successful, [
			{ documentId: "document" },
		]);
		assert.deepEqual(saved.stages["document-copy"].tenants.source.warnings, [
			{ documentId: "existing-document", message: "The self-hosted document already exists" },
		]);
		assert.deepEqual(saved.stages["mongodb-data"], { tenants: {} });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("creates missing results but never replaces an unreadable results path", async (t) => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-results-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const fresh = path.join(directory, "new-results");
	await writeStageResults(fresh, "document-copy", { tenants: {} });
	assert.deepEqual(
		JSON.parse(await readFile(path.join(fresh, RESULTS_FILE_NAME), "utf8")).stages,
		{ "document-copy": { tenants: {} } },
	);
	const unreadable = path.join(directory, RESULTS_FILE_NAME);
	await mkdir(unreadable);
	await writeFile(path.join(unreadable, "preserved"), "existing data");
	await assert.rejects(
		writeStageResults(directory, "document-copy", { tenants: {} }),
		/not overwritten.*different resultsDirectory/,
	);
	assert.equal(await readFile(path.join(unreadable, "preserved"), "utf8"), "existing data");
});

test("serializes snapshots and other stages without fixed-temp-file races", async (t) => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-results-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const results = createResults({ tenants: { source: {} } });
	const writes = [];
	for (let index = 0; index < 20; index++) {
		recordSuccess(results, "source", `doc-${index}`);
		writes.push(writeStageResults(directory, "document-copy", results));
		writes.push(writeStageResults(directory, `stage-${index}`, { index }));
	}
	await Promise.all(writes);
	const saved = JSON.parse(await readFile(path.join(directory, RESULTS_FILE_NAME), "utf8"));
	assert.equal(saved.stages["document-copy"].tenants.source.successful.length, 20);
	assert.equal(Object.keys(saved.stages).length, 21);
	assert.equal((await stat(path.join(directory, RESULTS_FILE_NAME))).mode & 0o777, 0o600);
	assert.deepEqual(await readdir(directory), [RESULTS_FILE_NAME]);
});

test("failed atomic publish preserves the prior JSON and removes private temporary files", async (t) => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-results-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeStageResults(directory, "original", { valid: true });
	const filename = path.join(directory, RESULTS_FILE_NAME);
	const before = await readFile(filename, "utf8");
	await assert.rejects(
		writeStageResults(
			directory,
			"new",
			{},
			{
				renameFile: async () => {
					throw new Error("simulated interruption");
				},
			},
		),
	);
	assert.equal(await readFile(filename, "utf8"), before);
	assert.deepEqual(await readdir(directory), [RESULTS_FILE_NAME]);
	await writeStageResults(directory, "later", {});
	assert.ok(JSON.parse(await readFile(filename, "utf8")).stages.later);
});

test("corrupt results are backed up and replaced with the latest outcomes and a warning", async (t) => {
	for (const corrupt of ["{broken", "null", '{"stages":[]}', '{"stages":null}', "{}"]) {
		const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-results-"));
		t.after(() => rm(directory, { recursive: true, force: true }));
		const filename = path.join(directory, RESULTS_FILE_NAME);
		await writeFile(filename, corrupt);
		const warnings = [];
		const results = createResults({ tenants: { source: {} } });
		recordSuccess(results, "source", "latest-document");
		await writeStageResults(directory, "document-copy", results, {
			warn: (message) => warnings.push(message),
			priorStages: { "tenant-creation": { preserved: true } },
		});
		const saved = JSON.parse(await readFile(filename, "utf8"));
		assert.deepEqual(saved.stages["document-copy"], results);
		assert.equal(saved.stages["tenant-creation"].preserved, true);
		const backups = (await readdir(directory)).filter((file) =>
			file.startsWith(`${RESULTS_FILE_NAME}.corrupt-`),
		);
		assert.equal(backups.length, 1);
		const backupPath = path.join(directory, backups[0]);
		assert.equal(await readFile(backupPath, "utf8"), corrupt);
		assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
		assert.equal((await stat(filename)).mode & 0o777, 0o600);
		assert.equal(warnings.length, 1);
		assert.ok(warnings[0].includes(backupPath));
		assert.match(warnings[0], /WARNING:.*Current results were saved/);
		assert.ok(!warnings[0].includes(corrupt));
		await writeStageResults(
			directory,
			"next-stage",
			{ complete: true },
			{
				warn: (message) => warnings.push(message),
			},
		);
		const updated = JSON.parse(await readFile(filename, "utf8"));
		assert.deepEqual(updated.stages["document-copy"], results);
		assert.equal(updated.stages["next-stage"].complete, true);
		assert.equal(warnings.length, 1);
	}
});

test("failed publication during corrupt-file recovery preserves the original file", async (t) => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-results-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const filename = path.join(directory, RESULTS_FILE_NAME);
	await writeFile(filename, "{broken");
	const warnings = [];
	await assert.rejects(
		writeStageResults(
			directory,
			"new",
			{},
			{
				warn: (message) => warnings.push(message),
				renameFile: async () => {
					throw new Error("simulated disk failure");
				},
			},
		),
		/simulated disk failure/,
	);
	assert.equal(await readFile(filename, "utf8"), "{broken");
	assert.equal(warnings.length, 0);
	assert.ok(!(await readdir(directory)).some((file) => file.includes(".tmp-")));
});

test("a second process cannot acquire a run lease", async (t) => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-results-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await withResultsLock(directory, async () => {
		await assert.rejects(
			withResultsLock(directory, async () => {}),
			/Results are locked/,
		);
		const child = spawnSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`const { withResultsLock } = await import(process.argv[1]);
			try {
				await withResultsLock(process.argv[2], async () => {});
				process.exitCode = 1;
			} catch (error) {
				if (error.name !== "ConfigurationError" || !error.message.includes("Results are locked")) throw error;
			}`,
				new URL("./results.mjs", import.meta.url).href,
				directory,
			],
			{ encoding: "utf8", timeout: 10_000 },
		);
		assert.equal(child.status, 0, child.stderr);
	});
});
