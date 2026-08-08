/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { startEphemeralService } from "@fluidframework/local-driver/alpha";
import { adaptLegacyDataStoreFactory } from "@fluidframework/runtime-utils/legacy/alpha";

import { TableDocument } from "../document.js";

interface LocalTableDocumentTestContext {
	/** The table document connected to the local service. */
	readonly tableDocument: TableDocument;
	/** Waits for locally submitted changes to be acknowledged by the local service. */
	readonly ensureSynchronized: () => Promise<void>;
	/** Closes the container and its ephemeral service. */
	readonly disposeContainerAndLocalService: () => Promise<void>;
}

const tableDocumentKind = adaptLegacyDataStoreFactory<TableDocument>(
	TableDocument.getFactory(),
);

/**
 * Creates a `TableDocument` connected to an ephemeral service using the current Fluid version.
 *
 * @returns The table document and functions for synchronizing and disposing its local container.
 */
export async function createLocalTableDocument(): Promise<LocalTableDocumentTestContext> {
	const service = startEphemeralService();
	const container = await service.defaultClient.createAttachedContainer(tableDocumentKind);

	return {
		tableDocument: container.data,
		ensureSynchronized: async () => service.synchronize(),
		disposeContainerAndLocalService: async () => service.close(),
	};
}
