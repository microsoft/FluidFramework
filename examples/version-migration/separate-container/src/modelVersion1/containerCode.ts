/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CompositeEntryPoint,
	loadCompositeRuntime,
	makeMigratorEntryPointPiece,
} from "@fluid-example/migration-tools/internal";
import type {
	IContainer,
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";

import type { IMigratableModel } from "../migratableModel.js";

import { modelEntryPointPiece } from "./modelEntryPointPiece.js";

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
	// TODO: Now that this all lives in the container code we can probably make some stronger type assumptions.
	if (typeof entryPoint.model !== "object") {
		throw new TypeError("Incompatible container runtime: doesn't provide model");
	}

	return entryPoint.model;
};

const exportDataCallback = async (container: IContainer): Promise<unknown> => {
	// TODO: verify IMigratableModel
	const exportModel = await getModelFromContainer<IMigratableModel>(container);
	return exportModel.exportData();
};

/**
 * @internal
 */
export class InventoryListContainerRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	private readonly runtimeOptions: IContainerRuntimeOptions | undefined;
	/**
	 * Constructor for the factory. Supports a test mode which spawns the summarizer instantly.
	 * @param testMode - True to enable instant summarizer spawning.
	 */
	public constructor(testMode: boolean) {
		this.runtimeOptions = testMode
			? {
					summaryOptions: {
						initialSummarizerDelayMs: 0,
					},
				}
			: undefined;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const compositeEntryPoint = new CompositeEntryPoint();
		compositeEntryPoint.addEntryPointPiece(modelEntryPointPiece);
		const migratorEntryPointPiece = makeMigratorEntryPointPiece(exportDataCallback);
		compositeEntryPoint.addEntryPointPiece(migratorEntryPointPiece);
		return loadCompositeRuntime(context, existing, compositeEntryPoint, this.runtimeOptions);
	}
}
