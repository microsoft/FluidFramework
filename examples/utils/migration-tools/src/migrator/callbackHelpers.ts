/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";

import { type ISimpleLoader } from "../simpleLoader/index.js";

import type { DataTransformationCallback, IMigratableModel } from "./interfaces.js";
import { type MigrationCallback } from "./migrator.js";

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
 * Make a typical migration callback.
 * @alpha
 */
export const makeMigrationCallback = (
	loader: ISimpleLoader,
	dataTransformationCallback?: DataTransformationCallback | undefined,
): MigrationCallback => {
	const migrationCallback = async (
		version: string,
		exportedData: unknown,
	): Promise<unknown> => {
		const detachedContainer = await loader.createDetached(version);
		const destinationModel = await getModelFromContainer<IMigratableModel>(
			detachedContainer.container,
		);
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
		const newContainerId = await detachedContainer.attach();
		detachedContainer.container.dispose();
		return newContainerId;
	};
	return migrationCallback;
};
