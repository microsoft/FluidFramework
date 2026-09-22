/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReferenceBackend } from "./backend.js";
import { localBackend } from "./localBackend.js";
import { runPendingRestoreWorkflow, runReferenceWorkflow } from "./workflow.js";

describe("Seed projection reference: Memorylicious lifecycle", function () {
	this.timeout(60_000);
	let backend: ReferenceBackend;
	beforeEach(() => {
		backend = localBackend();
	});
	afterEach(async () => {
		await backend.close();
	});

	it("externally creates, independently projects, merges, ACKs, and graduates to native state", async () => {
		await runReferenceWorkflow(backend);
	});
	it("reconstructs the projected context from pending state without the old overlay", async () => {
		await runPendingRestoreWorkflow(backend);
	});
	it("restores a tree-only original load as ISnapshot without mixing source and projected blobs", async () => {
		await runPendingRestoreWorkflow(backend, false);
	});
});
