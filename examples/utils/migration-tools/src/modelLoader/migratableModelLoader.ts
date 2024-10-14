/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IContainer,
	type IHostLoader,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import { ILoaderProps, Loader } from "@fluidframework/container-loader/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { type IMigratableModelContainerRuntimeEntryPoint } from "./instantiateMigratableRuntime.js";
import type {
	IAttachedMigratableModel,
	IDetachedMigratableModel,
	IMigratableModelLoader,
} from "./interfaces.js";

/**
 * @alpha
 */
export class MigratableModelLoader<ModelType> implements IMigratableModelLoader<ModelType> {
	private readonly loader: IHostLoader;
	private readonly generateCreateNewRequest: () => IRequest;

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
		this.loader = new Loader({
			urlResolver: props.urlResolver,
			documentServiceFactory: props.documentServiceFactory,
			codeLoader: props.codeLoader,
			logger: props.logger,
		});
		this.generateCreateNewRequest = props.generateCreateNewRequest;
	}

	public async supportsVersion(version: string): Promise<boolean> {
		// To answer the question of whether we support a given version, we would need to query the codeLoader
		// to see if it thinks it can load the requested version.  But for now, ICodeDetailsLoader doesn't have
		// a supports() method.  We could attempt a load and catch the error, but it might not be desirable to
		// load code just to check.  It might be desirable to add a supports() method to ICodeDetailsLoader.
		return true;
	}

	/**
	 * The purpose of the model pattern and the model loader is to wrap the IContainer in a more useful object and
	 * interface.  This demo uses a convention of the entrypoint providing a getModelAndMigrationTool method to do so.
	 * It does this with the expectation that the model has been bundled with the container code.
	 *
	 * Other strategies to obtain the wrapping model could also work fine here - for example a standalone model code
	 * loader that separately fetches model code and wraps the container from the outside.
	 */
	private async getModelAndMigrationToolFromContainer(
		container: IContainer,
	): Promise<IAttachedMigratableModel<ModelType>> {
		const entryPoint =
			(await container.getEntryPoint()) as IMigratableModelContainerRuntimeEntryPoint<ModelType>;
		// If the user tries to use this model loader with an incompatible container runtime, we want to give them
		// a comprehensible error message.  So distrust the type by default and do some basic type checking.
		if (typeof entryPoint.getModelAndMigrationTool !== "function") {
			throw new TypeError(
				"Incompatible container runtime: doesn't provide getModelAndMigrationTool",
			);
		}
		const modelAndMigrationTool = await entryPoint.getModelAndMigrationTool(container);
		if (typeof modelAndMigrationTool.model !== "object") {
			throw new TypeError("Incompatible container runtime: doesn't provide model");
		}
		if (typeof modelAndMigrationTool.migrationTool !== "object") {
			throw new TypeError("Incompatible container runtime: doesn't provide migrationTool");
		}
		return modelAndMigrationTool;
	}

	// It would be preferable for attaching to look more like service.attach(model) rather than returning an attach
	// callback here, but this callback at least allows us to keep the method off the model interface.
	// TODO: Consider making the version param optional, and in that case having a mechanism to query the codeLoader
	// for the latest/default version to use?
	public async createDetached(version: string): Promise<IDetachedMigratableModel<ModelType>> {
		const container = await this.loader.createDetachedContainer({ package: version });
		const { model, migrationTool } =
			await this.getModelAndMigrationToolFromContainer(container);
		// The attach callback lets us defer the attach so the caller can do whatever initialization pre-attach,
		// without leaking out the loader, service, etc.  We also return the container ID here so we don't have
		// to stamp it on something that would rather not know it (e.g. the model).
		const attach = async (): Promise<string> => {
			await container.attach(this.generateCreateNewRequest());
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			return container.resolvedUrl.id;
		};
		return { model, migrationTool, attach };
	}

	private async loadContainer(id: string): Promise<IContainer> {
		return this.loader.resolve({
			url: id,
			headers: {
				[LoaderHeader.loadMode]: {
					// Here we use "all" to ensure we are caught up before returning.  This is particularly important
					// for direct-link scenarios, where the user might have a direct link to a data object that was
					// just attached (i.e. the "attach" op and the "set" of the handle into some map is in the
					// trailing ops).  If we don't fully process those ops, the expected object won't be found.
					opsBeforeReturn: "all",
				},
			},
		});
	}

	public async loadExisting(id: string): Promise<IAttachedMigratableModel<ModelType>> {
		const container = await this.loadContainer(id);
		const { model, migrationTool } =
			await this.getModelAndMigrationToolFromContainer(container);
		return { model, migrationTool };
	}

	public async loadExistingToSequenceNumber(
		id: string,
		sequenceNumber: number,
	): Promise<IAttachedMigratableModel<ModelType>> {
		const container = await this.loadContainer(id);
		await new Promise<void>((resolve) => {
			if (sequenceNumber <= container.deltaManager.lastSequenceNumber) {
				resolve();
			}
			const callbackOps = (message: ISequencedDocumentMessage): void => {
				if (sequenceNumber <= message.sequenceNumber) {
					resolve();
					container.deltaManager.off("op", callbackOps);
				}
			};
			container.deltaManager.on("op", callbackOps);
		});
		const { model, migrationTool } =
			await this.getModelAndMigrationToolFromContainer(container);
		return { model, migrationTool };
	}
}
