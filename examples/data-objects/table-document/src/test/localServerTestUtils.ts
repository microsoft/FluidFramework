/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/legacy";
import { Loader } from "@fluidframework/container-loader/legacy";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/legacy";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { TableDocument } from "../document.js";

/**
 * Creates a `TableDocument` connected to an in-memory local service using the current Fluid version.
 *
 * @returns The table document and functions for synchronizing and disposing its local container.
 */
export async function createLocalTableDocument(): Promise<{
	tableDocument: TableDocument;
	ensureSynchronized: () => Promise<void>;
	dispose: () => Promise<void>;
}> {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();
	const codeDetails = { package: "table-document-test" };
	const tableDocumentFactory = TableDocument.getFactory();
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: tableDocumentFactory,
		registryEntries: [tableDocumentFactory.registryEntry],
	});
	const loader = new Loader({
		urlResolver: new LocalResolver(),
		documentServiceFactory: new LocalDocumentServiceFactory(deltaConnectionServer),
		codeLoader: {
			load: async () => ({
				module: { fluidExport: runtimeFactory },
				details: codeDetails,
			}),
		},
	});
	const container = await loader.createDetachedContainer(codeDetails);
	await container.attach(createLocalResolverCreateNewRequest("table-document-test"));
	const tableDocument = (await container.getEntryPoint()) as TableDocument;

	return {
		tableDocument,
		ensureSynchronized: async () => {
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			if (container.isDirty) {
				await new Promise<void>((resolve) => container.once("saved", () => resolve()));
			}
		},
		dispose: async () => {
			container.close();
			await deltaConnectionServer.close();
		},
	};
}
