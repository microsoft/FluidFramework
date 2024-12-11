/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { IRequest } from "@fluidframework/core-interfaces";

import type { MigrationCallback } from "./interfaces.js";

/**
 * These callback helpers are useful if you are migrating _TO_ this version of the platform.  If the platform changes significantly
 * in the future (e.g. loader API changes, create new flow changes), then you would likely want to use an updated set of callbacks
 * from the version of the platform you are migrating to instead.
 */

/**
 * A callback for creating a detached container.  We need to have an encapsulated attach(), since the
 * normal IContainer.attach() parameters vary between services.
 * @alpha
 */
export type CreateDetachedContainerCallback = (
	version: string,
) => Promise<{ container: IContainer; attach: () => Promise<string> }>;

/**
 * A callback for importing the exported data into the new destinationContainer.  You must implement this with the specifics of
 * your import flow.
 * @alpha
 */
export type ImportDataCallback = (
	destinationContainer: IContainer,
	exportedData: unknown,
) => Promise<void>;

/**
 * When using the makeSeparateContainerMigrationCallback(), the migration result will be a string with the container ID of
 * the new container.
 * @alpha
 */
export type SeparateContainerMigrationResult = string;

/**
 * Make an encapsulated createDetached callback for use with makeSeparateContainerMigrationCallback.  This is split off to
 * isolate the loader-specific API calls and the service-specific URL create new request format.
 * @alpha
 */
export const makeCreateDetachedContainerCallback = (
	loaderProps: ILoaderProps,
	generateCreateNewRequest: () => IRequest,
): CreateDetachedContainerCallback => {
	return async (
		version: string,
	): Promise<{ container: IContainer; attach: () => Promise<string> }> => {
		const container = await createDetachedContainer({
			...loaderProps,
			codeDetails: { package: version },
		});
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
 * Make a typical separate container migration callback.  It needs to be told how to create the new detached container and also
 * how to import the data into that container.  The migrationResult it generates is the container ID of the new container.
 * @alpha
 */
export const makeSeparateContainerMigrationCallback = (
	createDetachedContainerCallback: CreateDetachedContainerCallback,
	importDataCallback: ImportDataCallback,
): MigrationCallback => {
	const migrationCallback = async (
		version: string,
		exportedData: unknown,
	): Promise<SeparateContainerMigrationResult> => {
		const { container: destinationContainer, attach } =
			await createDetachedContainerCallback(version);
		await importDataCallback(destinationContainer, exportedData);
		const newContainerId = await attach();
		destinationContainer.dispose();
		return newContainerId;
	};
	return migrationCallback;
};
