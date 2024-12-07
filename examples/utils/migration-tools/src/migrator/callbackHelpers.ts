/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer, IHostLoader } from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";

import type { DataTransformationCallback, IMigratableModel } from "./interfaces.js";
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
 * Helper function for casting the container's entrypoint to the expected type.  Does a little extra
 * type checking for added safety.
 */
const getModelFromContainer = async <ModelType>(container: IContainer): Promise<ModelType> => {
	const entryPoint = (await container.getEntryPoint()) as {
		model: ModelType;
	};

	// If the user tries to use this with an incompatible container runtime, we want to give them
	// a comprehensible error message.  So distrust the type by default and do some basic type checking.
	if (typeof entryPoint.model !== "object") {
		throw new TypeError("Incompatible container runtime: doesn't provide model");
	}

	return entryPoint.model;
};

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
	dataTransformationCallback?: DataTransformationCallback | undefined,
): MigrationCallback => {
	const migrationCallback = async (
		version: string,
		exportedData: unknown,
	): Promise<unknown> => {
		const { container, attach } = await createDetachedContainerCallback(version);
		const destinationModel = await getModelFromContainer<IMigratableModel>(container);
		// TODO: Is there a reasonable way to validate at proposal time whether we'll be able to get the
		// exported data into a format that the new model can import?  If we can determine it early, then
		// clients with old MigratableModelLoaders can use that opportunity to dispose early and try to get new
		// MigratableModelLoaders.
		// TODO: Error paths in case the format isn't ingestible.
		let transformedData: unknown;
		if (destinationModel.supportsDataFormat(exportedData)) {
			// If the migrated model already supports the data format, go ahead with the migration.
			transformedData = exportedData;
		} else if (dataTransformationCallback !== undefined) {
			// Otherwise, try using the dataTransformationCallback if provided to get the exported data into
			// a format that we can import.
			transformedData = await dataTransformationCallback(
				exportedData,
				destinationModel.version,
			);
		}
		await destinationModel.importData(transformedData);
		const newContainerId = await attach();
		container.dispose();
		return newContainerId;
	};
	return migrationCallback;
};
