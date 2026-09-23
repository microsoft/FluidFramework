/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { randomUUID } from "node:crypto";

import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import {
	createInspectableStorageAdapter,
	type IInspectableStorageAdapter,
} from "./inspectableStorageAdapter.js";

/**
 * Configure the generic storage adapter with a real Memorylicious server and local-driver.
 * The returned backend can create multiple independent files and load multiple clients per file.
 * Wrappers record client summary upload attempts; create() writes are deliberately not in that journal.
 * This owns a real local service, not a mocked collaboration/summary transport; close it after each scenario.
 */
export function createLocalSeedBackend(): IInspectableStorageAdapter {
	const server = LocalDeltaConnectionServer.create();
	const rawFactory = new LocalDocumentServiceFactory(server);
	const resolver = new LocalResolver();
	return createInspectableStorageAdapter({
		documentServiceFactory: rawFactory,
		urlResolver: resolver,
		createCreateNewRequest: () => resolver.createCreateNewRequest(`seed-${randomUUID()}`),
		omitsUnrequestedGroupBlobs: true,
		supportsLoadingGroups: true,
		async close() {
			await server.close();
		},
	});
}
