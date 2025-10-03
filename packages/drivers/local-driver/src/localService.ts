/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ICodeDetailsLoader,
	IContainer,
	IContainerContext,
	IFluidCodeDetails,
	IFluidCodeDetailsComparer,
	IFluidModuleWithDetails,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	ServiceOptions,
	ServiceClient,
	FluidContainerAttached,
	DataStoreKind,
	Registry,
	FluidContainerWithService,
	NamedFluidDataStoreRegistryEntries,
	NamedFluidDataStoreRegistryEntry2,
	IFluidDataStoreFactory,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { LocalDocumentServiceFactory } from "./localDocumentServiceFactory.js";
import { createLocalResolverCreateNewRequest, LocalResolver } from "./localResolver.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * Creates and returns a document service for local use.
 *
 * @remarks
 * Since all collaborators are in the same process, minVersionForCollab can be omitted and will default to the current version.
 *
 * @alpha
 */
export function createEphemeralServiceClient(
	options: ServiceOptions = { minVersionForCollab: pkgVersion },
): ServiceClient {
	return new EphemeralServiceClient(options);
}

/**
 * Ephemeral service client for local use.
 *
 * TODO: Implement:
 * Maybe this can be layered on-top of `IDocumentService`?
 * If so, a base class could be written in terms of `IDocumentService`,
 * then the service specific derived class could use {@link createLocalDocumentService} to get it.
 */
class EphemeralServiceClient implements ServiceClient {
	public constructor(public readonly options: ServiceOptions) {}

	public async createContainer<T>(
		root: DataStoreKind<T>,
	): Promise<FluidContainerWithService<T>> {
		return EphemeralServiceContainer.createDetached(normalizeRegistry(root), this, root);
	}

	public async loadContainer<T>(
		id: string,
		root: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerAttached<T>> {
		return EphemeralServiceContainer.load(normalizeRegistry(root), this, id);
	}
}

/**
 * Synchronizes all local clients.
 * @alpha
 */
export async function synchronizeLocalService(): Promise<void> {
	while (await localServer.hasPendingWork()) {}
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

const rootDataStoreId = "root";

type DataStoreRegistry<T> = Registry<Promise<DataStoreKind<T>>>;

// TODO: these should not be needed
const knownRegistryKeys = ["test", "my-tree"] as const;

function convertRegistry<T>(
	registry: DataStoreRegistry<T>,
): NamedFluidDataStoreRegistryEntries {
	return knownRegistryKeys.map(
		(key): NamedFluidDataStoreRegistryEntry2 => [
			key,
			(async (): Promise<IFluidDataStoreFactory> =>
				(await registry(key)) as unknown as IFluidDataStoreFactory)(),
		],
	);
}

function makeCodeLoader<T>(
	registry: DataStoreRegistry<T>,
	minVersionForCollab: MinimumVersionForCollab,
	root?: DataStoreKind<T>,
): ICodeDetailsLoader {
	const fluidExport: IRuntimeFactory & IFluidCodeDetailsComparer = {
		async instantiateRuntime(
			context: IContainerContext,
			existing: boolean,
		): Promise<IRuntime> {
			const provideEntryPoint = async (
				entryPointRuntime: IContainerRuntime,
			): Promise<T & FluidObject> => {
				const data = await entryPointRuntime.getAliasedDataStoreEntryPoint(rootDataStoreId);
				if (data === undefined) {
					throw new Error("Root data store missing!");
				}
				const rootDataStore = await data.get();
				// TODO: verify type?
				return rootDataStore as T & FluidObject;
			};

			const runtime = await loadContainerRuntime({
				context,
				registryEntries: convertRegistry(registry),
				provideEntryPoint,
				existing,
				minVersionForCollab,
				runtimeOptions: { enableRuntimeIdCompressor: "on" },
			});

			if (!existing) {
				assert(root !== undefined, "Root data store kind must be provided for new containers");
				const dataStore = await runtime.createDataStore(
					(root as unknown as IFluidDataStoreFactory).type,
				);
				const aliasResult = await dataStore.trySetAlias(rootDataStoreId);
				assert(aliasResult === "Success", "Should be able to set alias on new data store");
			}

			return runtime;
		},

		async satisfies(
			candidate: IFluidCodeDetails,
			constraint: IFluidCodeDetails,
		): Promise<boolean> {
			return true;
		},

		async compare(a: IFluidCodeDetails, b: IFluidCodeDetails): Promise<number | undefined> {
			return 0;
		},

		get IRuntimeFactory(): IRuntimeFactory {
			return fluidExport;
		},

		get IFluidCodeDetailsComparer(): IFluidCodeDetailsComparer {
			return fluidExport;
		},
	};

	const codeLoader: ICodeDetailsLoader = {
		load: async (details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport }, // new BlobCollectionContainerRuntimeFactory()
				details,
			};
		},
	};

	return codeLoader;
}

let documentIdCounter = 0;

class EphemeralServiceContainer<T> implements FluidContainerWithService<T> {
	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		service: EphemeralServiceClient,
		root: DataStoreKind<T>,
	): Promise<EphemeralServiceContainer<T>> {
		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader: makeCodeLoader(registry, service.options.minVersionForCollab, root),
		});

		return new EphemeralServiceContainer<T>(
			registry,
			service,
			container,
			(await container.getEntryPoint()) as T,
			undefined,
		);
	}

	public static async load<T>(
		registry: DataStoreRegistry<T>,
		service: EphemeralServiceClient,
		id: string,
	): Promise<EphemeralServiceContainer<T> & FluidContainerAttached<T>> {
		const containerInner = await loadExistingContainer({
			request: createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader: makeCodeLoader(registry, service.options.minVersionForCollab),
		});

		const container = new EphemeralServiceContainer<T>(
			registry,
			service,
			containerInner,
			(await containerInner.getEntryPoint()) as T,
			id,
		);
		assert(container.id !== undefined, "id should be defined when loading a container");
		return container as typeof container & { id: string };
	}

	private constructor(
		public readonly registry: Registry<Promise<DataStoreKind<T>>>,
		public readonly service: EphemeralServiceClient,
		public readonly container: IContainer,
		public readonly data: T,
		public id: string | undefined,
	) {}

	public async attach(): Promise<FluidContainerAttached<T>> {
		// TODO: handel concurrent attach calls
		if (this.id !== undefined) {
			throw new UsageError("Container already attached");
		}

		const documentId = (documentIdCounter++).toString();
		await this.container.attach(createLocalResolverCreateNewRequest(documentId));

		if (this.container.resolvedUrl === undefined) {
			throw new Error("Resolved Url unexpectedly missing!");
		}
		this.id = this.container.resolvedUrl.id;

		return this as typeof this & { id: string };
	}
}

function normalizeRegistry<T>(
	input: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
): Registry<Promise<DataStoreKind<T>>> {
	// TODO: its possible one might use a constructor as a DataStoreKind, which would break this. A better check might be needed.
	if (typeof input === "function") {
		return input;
	}
	return async () => input;
}
