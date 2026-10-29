/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareRun } from "./resume.mjs";
import { fixture } from "../document-copy/fixtures.mjs";

test("rejects legacy, corrupt, duplicate, out-of-inventory and remapped resume work", async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "selfhost-resume-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const file = path.join(root, "reviewed.json");
	const f = fixture({ documents: 1 });
	const { results } = await prepareRun(f.config, f.inventory);
	for (const mutate of [
		(result) => {
			delete result.version;
		},
		(result) => {
			result.tenants["source-1"].failed = [{ documentId: "missing" }];
		},
		(result) => {
			result.tenants["source-1"].failed = [
				{ documentId: "doc-1-0" },
				{ documentId: "doc-1-0" },
			];
		},
		(result) => {
			result.mapping["source-1"].destination.tenantId = "other";
		},
		(result) => {
			result.history["source-1"] = { "doc-1-0": {} };
		},
		(result) => {
			result.history["source-1"] = 7;
		},
		(result) => {
			result.tenants["source-1"] = null;
		},
		(result) => {
			result.tenants.unmapped = { successful: [], warnings: [], failed: [] };
		},
	]) {
		const value = structuredClone(results);
		mutate(value);
		await writeFile(file, JSON.stringify({ stages: { "document-copy": value } }));
		await assert.rejects(prepareRun(f.config, f.inventory, file));
	}
	await writeFile(file, "{");
	await assert.rejects(prepareRun(f.config, f.inventory, file), /Unable to read/);
});

test("rejects duplicate inventory documents and never serializes URL credentials", async () => {
	const f = fixture({ documents: 1 });
	f.inventory.tenants["source-1"].documents.push("doc-1-0");
	await assert.rejects(prepareRun(f.config, f.inventory), /unique/);
	f.inventory.tenants["source-1"].documents.pop();
	f.config.selfHost.alfredEndpoint = "https://user:password@alfred.example?token=secret";
	await assert.rejects(prepareRun(f.config, f.inventory), /without credentials/);
});

test("rejects two source documents mapped to the same destination identity", async () => {
	const f = fixture({ tenants: 2, documents: 1 });
	f.inventory.tenants["source-2"] = {
		selfHostTenantId: "destination-1",
		documents: ["doc-1-0"],
	};
	await assert.rejects(prepareRun(f.config, f.inventory), /same destination/);
});
