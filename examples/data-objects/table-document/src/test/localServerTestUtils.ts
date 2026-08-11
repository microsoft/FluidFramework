/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/legacy";
import { Loader } from "@fluidframework/container-loader/legacy";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/legacy";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { TableDocument } from "../document.js";

interface LocalTableDocumentTestContext {
	/** The table document connected to the local service. */
	readonly tableDocument: TableDocument;
	/** Waits for locally submitted changes to be acknowledged by the local service. */
	readonly ensureSynchronized: () => Promise<void>;
	/** Closes the container and its in-memory local service. */
	readonly disposeContainerAndLocalService: () => Promise<void>;
}

/**
 * Creates a `TableDocument` connected to an in-memory local service using the current Fluid version.
 *
 * @returns The table document and functions for synchronizing and disposing its local test context.
 */
export async function createLocalTableDocument(): Promise<LocalTableDocumentTestContext> {
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
	const tableDocument = await container.getEntryPoint();
	assert(tableDocument instanceof TableDocument, "Expected a TableDocument entry point");

	return {
		tableDocument,
		ensureSynchronized: async () => {
			// Yield so locally submitted changes can mark the container dirty before checking it.
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			if (container.isDirty) {
				await new Promise<void>((resolve) => container.once("saved", () => resolve()));
			}
		},
		disposeContainerAndLocalService: async () => {
			container.close();
			await deltaConnectionServer.close();
		},
	};
}
