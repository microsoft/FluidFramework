/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IContainer } from "@fluidframework/container-definitions/internal";
import { ILoaderProps } from "@fluidframework/container-loader/internal";
import type { IRequest } from "@fluidframework/core-interfaces";

import type { IMigrationTool } from "../interfaces/index.js";
import {
	type ISimpleLoader,
	SimpleLoader,
	waitForAtLeastSequenceNumber,
} from "../simpleLoader/index.js";

import type {
	IAttachedMigratableModel,
	IDetachedMigratableModel,
	IMigratableModelLoader,
} from "./interfaces.js";

/**
 * The purpose of the model pattern and the model loader is to wrap the IContainer in a more useful object and
 * interface.  This demo uses a convention of the entrypoint providing a getModelAndMigrationTool method to do so.
 * It does this with the expectation that the model has been bundled with the container code.
 *
 * Other strategies to obtain the wrapping model could also work fine here - for example a standalone model code
 * loader that separately fetches model code and wraps the container from the outside.
 */
const getModelAndMigrationToolFromContainer = async <ModelType>(
	container: IContainer,
): Promise<IAttachedMigratableModel<ModelType>> => {
	// TODO: Fix typing here
	const entryPoint = (await container.getEntryPoint()) as {
		getModel: (container: IContainer) => Promise<ModelType>;
		migrationTool: IMigrationTool;
	};
	// If the user tries to use this model loader with an incompatible container runtime, we want to give them
	// a comprehensible error message.  So distrust the type by default and do some basic type checking.
	if (typeof entryPoint.getModel !== "function") {
		throw new TypeError("Incompatible container runtime: doesn't provide getModel");
	}
	const model = await entryPoint.getModel(container);
	if (typeof model !== "object") {
		throw new TypeError("Incompatible container runtime: doesn't provide model");
	}
	if (typeof entryPoint.migrationTool !== "object") {
		throw new TypeError("Incompatible container runtime: doesn't provide migrationTool");
	}
	return { model, migrationTool: entryPoint.migrationTool };
};

/**
 * @alpha
 */
export class MigratableModelLoader<ModelType> implements IMigratableModelLoader<ModelType> {
	private readonly loader: ISimpleLoader;

	// TODO: See if there's a nicer way to parameterize the createNew request.
	// Here we specifically pick just the loader props we know we need to keep API exposure low.  Fine to add more
	// here if we determine they're needed, but they should be picked explicitly (e.g. avoid "scope").
	public constructor(
		props: Pick<
			ILoaderProps,
			"urlResolver" | "documentServiceFactory" | "codeLoader" | "logger"
		> & {
			generateCreateNewRequest: () => IRequest;
		},
	) {
		const {
			urlResolver,
			documentServiceFactory,
			codeLoader,
			logger,
			generateCreateNewRequest,
		} = props;

		// TODO: inject this instead of creating here?
		this.loader = new SimpleLoader({
			urlResolver,
			documentServiceFactory,
			codeLoader,
			logger,
			generateCreateNewRequest,
		});
	}

	public async supportsVersion(version: string): Promise<boolean> {
		// To answer the question of whether we support a given version, we would need to query the codeLoader
		// to see if it thinks it can load the requested version.  But for now, ICodeDetailsLoader doesn't have
		// a supports() method.  We could attempt a load and catch the error, but it might not be desirable to
		// load code just to check.  It might be desirable to add a supports() method to ICodeDetailsLoader.
		return true;
	}

	// It would be preferable for attaching to look more like service.attach(model) rather than returning an attach
	// callback here, but this callback at least allows us to keep the method off the model interface.
	// TODO: Consider making the version param optional, and in that case having a mechanism to query the codeLoader
	// for the latest/default version to use?
	public async createDetached(version: string): Promise<IDetachedMigratableModel<ModelType>> {
		const { container, attach } = await this.loader.createDetached(version);
		const { model, migrationTool } =
			await getModelAndMigrationToolFromContainer<ModelType>(container);
		return { model, migrationTool, attach };
	}

	public async loadExisting(id: string): Promise<IAttachedMigratableModel<ModelType>> {
		const container = await this.loader.loadExisting(id);
		const { model, migrationTool } =
			await getModelAndMigrationToolFromContainer<ModelType>(container);
		return { model, migrationTool };
	}

	public async loadExistingToSequenceNumber(
		id: string,
		sequenceNumber: number,
	): Promise<IAttachedMigratableModel<ModelType>> {
		const container = await this.loader.loadExisting(id);
		await waitForAtLeastSequenceNumber(container, sequenceNumber);
		const { model, migrationTool } =
			await getModelAndMigrationToolFromContainer<ModelType>(container);
		return { model, migrationTool };
	}
}
