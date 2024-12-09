/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer, IHostLoader } from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";

import { type MigrationCallback } from "./migrator.js";

/**
 * A callback for creating a detached container.  We need to have an encapsulated attach(), since the
 * normal IContainer.attach() parameters vary between services.
 * @alpha
 */
export type CreateDetachedContainerCallback = (
	version: string,
) => Promise<{ container: IContainer; attach: () => Promise<string> }>;

/**
 * The DataTransformationCallback gives an opportunity to modify the exported data before attempting an import.
 * The targetVersion is also provided to inform the appropriate transformation to perform.
 * It is async to permit network calls or lazy-loading the transform logic within the function.
 * @alpha
 */
export type DataTransformationCallback = (
	exportedData: unknown,
	targetVersion: string,
) => Promise<unknown>;

/**
 * A callback for creating a detached container.  We need to have an encapsulated attach(), since the
 * normal IContainer.attach() parameters vary between services.
 * @alpha
 */
export type ImportDataCallback = (
	destinationContainer: IContainer,
	exportedData: unknown,
) => Promise<void>;

/**
 * Make an encapsulated createDetached callback for use with makeMigrationCallback.
 * @alpha
 */
export const makeCreateDetachedCallback = (
	loader: IHostLoader,
	generateCreateNewRequest: () => IRequest,
) => {
	return async (
		version: string,
	): Promise<{ container: IContainer; attach: () => Promise<string> }> => {
		const container = await loader.createDetachedContainer({ package: version });
		// The attach callback lets us defer the attach so the caller can do whatever initialization pre-attach,
		// without leaking out the loader, service, etc.  We also return the container ID here so we don't have
		// to stamp it on something that would rather not know it (e.g. the container).
		const attach = async (): Promise<string> => {
			await container.attach(generateCreateNewRequest());
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			return container.resolvedUrl.id;
		};
		return { container, attach };
	};
};

/**
 * Make a typical migration callback.
 * @alpha
 */
export const makeMigrationCallback = (
	createDetachedContainerCallback: CreateDetachedContainerCallback,
	importDataCallback: ImportDataCallback,
): MigrationCallback => {
	const migrationCallback = async (
		version: string,
		exportedData: unknown,
	): Promise<unknown> => {
		const { container: destinationContainer, attach } =
			await createDetachedContainerCallback(version);
		await importDataCallback(destinationContainer, exportedData);
		const newContainerId = await attach();
		destinationContainer.dispose();
		return newContainerId;
	};
	return migrationCallback;
};
