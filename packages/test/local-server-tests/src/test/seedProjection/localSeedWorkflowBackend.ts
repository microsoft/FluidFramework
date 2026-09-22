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

import { forward } from "./seedRuntimeAdapter.js";
import type { SeedWorkflowBackend } from "./seedWorkflowBackend.js";

/**
 * Create the Memorylicious implementation of SeedWorkflowBackend: one in-process server plus local-driver.
 * The returned backend can create multiple independent files and load multiple clients per file.
 * Wrappers record client summary upload attempts; create() writes are deliberately not in that journal.
 * This owns a real local service, not a mocked collaboration/summary transport; close it after each scenario.
 */
export function createLocalSeedBackend(): SeedWorkflowBackend {
	const server = LocalDeltaConnectionServer.create();
	const rawFactory = new LocalDocumentServiceFactory(server);
	const resolver = new LocalResolver();
	const uploads: SeedWorkflowBackend["uploads"] = [];
	const documentServiceFactory = forward(rawFactory, {
		createDocumentService: async (...args) => {
			const service = await rawFactory.createDocumentService(...args);
			const documentUrl = await resolver.getAbsoluteUrl(service.resolvedUrl, "");
			return forward(service, {
				connectToStorage: async () => {
					const storage = await service.connectToStorage();
					return forward(storage, {
						uploadSummaryWithContext: async (summary, context) => {
							uploads.push({ documentUrl, summary, context });
							return storage.uploadSummaryWithContext(summary, context);
						},
					});
				},
			});
		},
	});
	return {
		documentServiceFactory,
		urlResolver: resolver,
		omitsUnrequestedGroupBlobs: true,
		supportsLoadingGroups: true,
		uploads,
		async create(summary) {
			const request = resolver.createCreateNewRequest(`seed-${randomUUID()}`);
			const resolved = await resolver.resolve(request);
			const service = await rawFactory.createContainer(summary, resolved);
			try {
				return await resolver.getAbsoluteUrl(service.resolvedUrl, "");
			} finally {
				service.dispose();
			}
		},
		async inspect(url, version, groups) {
			const service = await rawFactory.createDocumentService(await resolver.resolve({ url }));
			try {
				const storage = await service.connectToStorage();
				if (storage.getSnapshot === undefined) {
					throw new Error("The backend does not support getSnapshot");
				}
				return {
					snapshot: await storage.getSnapshot({ versionId: version, loadingGroupIds: groups }),
					readBlob: storage.readBlob.bind(storage),
					dispose: () => service.dispose(),
				};
			} catch (error) {
				service.dispose();
				throw error;
			}
		},
		async close() {
			await server.close();
		},
	};
}
