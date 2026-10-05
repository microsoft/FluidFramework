/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	RESULTS_FILE_NAME,
	createResults,
	recordSuccess,
	recordWarning,
	writeStageResults,
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
			{
				documentId: "existing-document",
				message: "The self-hosted document already exists",
			},
		]);
		assert.deepEqual(saved.stages["mongodb-data"], { tenants: {} });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
