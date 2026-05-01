/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ConnectionState,
	type IContainer,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	type ContainerRuntimeLoader,
	type ContainerRuntimeLoaderParams,
	makeCodeLoader,
	makeServiceClientImpl,
	rootDataStoreId,
} from "@fluidframework/driver-utils/internal";
import type {
	ServiceOptions,
	ServiceClient,
	FluidContainerAttached,
	DataStoreKind,
	FluidContainerWithService,
	DataStoreRegistry,
	Registry,
} from "@fluidframework/runtime-definitions/internal";
import { ServiceContainerBase } from "@fluidframework/runtime-definitions/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import { LocalDocumentServiceFactory } from "./localDocumentServiceFactory.js";
import { createLocalResolverCreateNewRequest, LocalResolver } from "./localResolver.js";
import { pkgVersion } from "./packageVersion.js";

const defaultServiceOptions: ServiceOptions = { minVersionForCollab: pkgVersion };

/**
 * Creates and returns a document service for local use.
 *
 * @remarks
 * Since all collaborators are in the same process, minVersionForCollab can be omitted and will default to the current version.
 * @privateRemarks
 * TODO: We should provide a way to extract (for potential serialization as test data) and load documents into this service.
 * This is needed to use this API surface for testing reference documents.
 * Ideally we would provide a service agnostic way to to the export, but likely only support loading them into the local service.
 * This can be done via a an API on FluidContainer (or a free function taking one) to do the export, then adding a service specific API to load from the export format and return the ID of the loaded document.
 *
 * @alpha
 */
export function createEphemeralServiceClient(
	options: ServiceOptions = defaultServiceOptions,
): ServiceClient {
	return makeServiceClientImpl(options, EphemeralServiceContainer);
}

/**
 * Closes any open ephemeral service containers.
 *
 * @remarks
 * This can be used to cleanup lingering timers from containers created using a client from {@link createEphemeralServiceClient}.
 * Such timers are a common case of hangs on exist (often worked around using Mocha's `--exit` flag).
 * @alpha
 */
export async function closeEphemeralContainers(): Promise<void> {
	const toClose = containers;
	containers = [];
	for (const c of toClose) {
		c.container.close();
	}
	updateContainers();
}

const containerRuntimeLoader: ContainerRuntimeLoader = async (
	parameters: ContainerRuntimeLoaderParams,
) => {
	const { runtime } = await ContainerRuntime.loadRuntime2({
		context: parameters.context,
		registry: parameters.registry,
		provideEntryPoint: parameters.provideEntryPoint,
		existing: parameters.existing,
		minVersionForCollab: parameters.minVersionForCollab,
		runtimeOptions: { enableRuntimeIdCompressor: "on" },
	});
	if (!parameters.existing) {
		assert(
			parameters.newContainerRootType !== undefined,
			"Root data store kind must be provided for new containers",
		);
		const dataStore = await runtime.createDataStore(parameters.newContainerRootType);
		const aliasResult = await dataStore.trySetAlias(rootDataStoreId);
		assert(aliasResult === "Success", "Should be able to set alias on new data store");
	}
	return runtime;
};

let containers: EphemeralServiceContainer<unknown>[] = [];

function updateContainers(): void {
	containers = containers.filter((c) => !c.container.closed);
}

/**
 * Synchronizes all local clients.
 * @alpha
 */
export async function synchronizeLocalService(): Promise<void> {
	// based on LoaderContainerTracker.ensureSynchronized, but stripped down a lot. Might miss some edge cases.

	let clean = 0;

	while (clean < 2) {
		// TODO: does this accomplish anything?
		while (await localServer.hasPendingWork()) {
			clean = 0;
		}

		updateContainers();
		const containersToApply = containers.map((c) => c.container);

		// Ignore readonly dirty containers, because it can't send ops and nothing can be done about it being dirty
		const dirtyContainers = containersToApply.filter((c) => {
			const { deltaManager, isDirty, connectionState } = c;
			return (
				connectionState !== ConnectionState.Disconnected &&
				deltaManager.readOnlyInfo.readonly !== true &&
				isDirty
			);
		});
		if (dirtyContainers.length > 0) {
			await Promise.all(
				dirtyContainers.map(async (c) =>
					Promise.race([
						new Promise((resolve) => c.once("saved", resolve)),
						new Promise((resolve) => c.once("closed", resolve)),
					]),
				),
			);
			clean = 0;
		}

		// yield a turn to allow side effect of resuming or the ops we just processed execute before we check
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});

		clean++;
	}
}

// A single localServer should be shared by all instances of a local driver so they can communicate
// with each other.
const localServer: ILocalDeltaConnectionServer =
	LocalDeltaConnectionServer.create(
		// new LocalSessionStorageDbFactory(),
	);

const urlResolver = new LocalResolver();
const documentServiceFactory = new LocalDocumentServiceFactory(localServer);
// const createCreateNewRequest = (id: string) => createLocalResolverCreateNewRequest(id);
const createLoadExistingRequest = (documentId: string): IRequest => {
	return { url: `http://localhost:3000/${documentId}` };
};

let documentIdCounter = 0;

/**
 * A Fluid container backed by an ephemeral (in-memory) local service, implementing
 * {@link @fluidframework/runtime-definitions#FluidContainerWithService}.
 *
 * @remarks
 * Data is stored in-memory and shared only within the same browser session via the module-level
 * {@link localServer}. All containers created by {@link createEphemeralServiceClient} share the
 * same server instance, enabling side-by-side collaboration testing without a real server.
 *
 * @internal
 */
export class EphemeralServiceContainer<TData>
	extends ServiceContainerBase<TData, ServiceOptions>
	implements FluidContainerWithService<TData>
{
	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: ServiceOptions,
		root: DataStoreKind<T>,
	): Promise<EphemeralServiceContainer<T>> {
		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader: makeCodeLoader(
				registry,
				options.minVersionForCollab,
				containerRuntimeLoader,
				root,
			),
		});

		return new EphemeralServiceContainer<T>(
			registry,
			options,
			container,
			(await container.getEntryPoint()) as T,
			undefined,
		);
	}

	public static async load<T>(
		registry: DataStoreRegistry<T>,
		options: ServiceOptions,
		id: string,
	): Promise<EphemeralServiceContainer<T> & FluidContainerAttached<T>> {
		const containerInner = await loadExistingContainer({
			request: createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader: makeCodeLoader(
				registry,
				options.minVersionForCollab,
				containerRuntimeLoader,
			),
		});

		const container = new EphemeralServiceContainer<T>(
			registry,
			options,
			containerInner,
			(await containerInner.getEntryPoint()) as T,
			id,
		);
		assert(container.id !== undefined, "id should be defined when loading a container");
		return container as typeof container & { id: string };
	}

	private constructor(
		registry: Registry<Promise<DataStoreKind<TData>>>,
		options: ServiceOptions,
		container: IContainer,
		data: TData,
		id: string | undefined,
	) {
		super(registry, options, container, data, id);
		containers.push(this);
		updateContainers();
	}

	protected createAttachRequest(): IRequest {
		const documentId = (documentIdCounter++).toString();
		return createLocalResolverCreateNewRequest(documentId);
	}
}
