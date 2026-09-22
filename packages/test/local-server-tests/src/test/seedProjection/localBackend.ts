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

import { forward } from "./adapter.js";
import type { ReferenceBackend } from "./backend.js";

/** Memorylicious in this reference means local-driver + one shared in-process server. */
export function localBackend(): ReferenceBackend {
	const server = LocalDeltaConnectionServer.create();
	const rawFactory = new LocalDocumentServiceFactory(server);
	const resolver = new LocalResolver();
	const uploads: ReferenceBackend["uploads"] = [];
	const documentServiceFactory = forward(rawFactory, {
		createDocumentService: async (...args) => {
			const service = await rawFactory.createDocumentService(...args);
			return forward(service, {
				connectToStorage: async () => {
					const storage = await service.connectToStorage();
					return forward(storage, {
						uploadSummaryWithContext: async (summary, context) => {
							uploads.push({ summary, context });
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
		expectGroupOmission: true,
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
