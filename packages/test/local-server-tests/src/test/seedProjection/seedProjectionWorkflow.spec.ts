/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createLocalSeedBackend } from "./localSeedWorkflowBackend.js";
import { runPendingRestoreWorkflow, runReferenceWorkflow } from "./seedProjectionWorkflow.js";
import type { SeedWorkflowBackend } from "./seedWorkflowBackend.js";

// Run backend-neutral lifecycle contracts against real in-process sequencing and summary storage.
describe("Seed projection reference: Memorylicious lifecycle", function () {
	this.timeout(60_000);
	let backend: SeedWorkflowBackend;
	beforeEach(() => {
		backend = createLocalSeedBackend();
	});
	afterEach(async () => {
		await backend.close();
	});

	// Cover the entire seed-to-native path, including no writes on open and post-graduation projection refresh.
	it("externally creates, independently projects, merges, ACKs, and graduates to native state", async () => {
		await runReferenceWorkflow(backend);
	});
	// Reconstruct omitted source bodies from pending state and replay a disconnected edit into real collaboration.
	it("reconstructs the projected context from pending state without the old overlay", async () => {
		await runPendingRestoreWorkflow(backend);
	});
	// A different initial snapshot API must not change restoration's native snapshot/blob consistency.
	it("restores a tree-only original load as ISnapshot without mixing source and projected blobs", async () => {
		await runPendingRestoreWorkflow(backend, false);
	});
});
