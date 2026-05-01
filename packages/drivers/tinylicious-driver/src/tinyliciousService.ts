/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IUrlResolver } from "@fluidframework/driver-definitions/internal";
import {
	type ContainerRuntimeLoader,
	type ContainerRuntimeLoaderParams,
	makeCodeLoader,
	makeServiceClientImpl,
	rootDataStoreId,
} from "@fluidframework/driver-utils/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import type {
	DataStoreKind,
	DataStoreRegistry,
	FluidContainerAttached,
	FluidContainerWithService,
	Registry,
	ServiceClient,
	ServiceOptions,
} from "@fluidframework/runtime-definitions/internal";
import { ServiceContainerBase } from "@fluidframework/runtime-definitions/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";

import { InsecureTinyliciousTokenProvider } from "./insecureTinyliciousTokenProvider.js";
import {
	createInsecureTinyliciousTestUrlResolver,
	createTinyliciousCreateNewRequest,
	InsecureTinyliciousUrlResolver,
} from "./insecureTinyliciousUrlResolver.js";

/**
 * Options for configuring a {@link createTinyliciousServiceClient}.
 * @alpha
 */
export interface TinyliciousServiceOptions extends ServiceOptions {
	/**
	 * The port tinylicious is listening on. Defaults to 7070.
	 */
	readonly port?: number;
	/**
	 * The endpoint tinylicious is listening on. Defaults to "http://localhost".
	 * In GitHub Codespaces, use the forwarded URL for the tinylicious port.
	 */
	readonly endpoint?: string;
}

/**
 * Creates a {@link @fluidframework/runtime-definitions#ServiceClient} backed by a local tinylicious server.
 *
 * @remarks
 * Requires a tinylicious server to be running (e.g. `pnpm tinylicious`).
 * Unlike {@link @fluidframework/local-driver#createEphemeralServiceClient}, this client persists containers
 * and supports real multi-process collaboration.
 *
 * @alpha
 */
export function createTinyliciousServiceClient(
	options: TinyliciousServiceOptions,
): ServiceClient {
	return makeServiceClientImpl(options, TinyliciousServiceContainer);
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

function makeContainerLoaderOptions(options: TinyliciousServiceOptions): {
	urlResolver: IUrlResolver;
	documentServiceFactory: RouterliciousDocumentServiceFactory;
	clientDetailsOverride: { capabilities: { interactive: boolean } };
	configProvider: ReturnType<typeof wrapConfigProviderWithDefaults>;
} {
	const tokenProvider = new InsecureTinyliciousTokenProvider();
	const urlResolver =
		options.port === undefined && options.endpoint === undefined
			? createInsecureTinyliciousTestUrlResolver()
			: new InsecureTinyliciousUrlResolver(options.port, options.endpoint);
	const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);

	return {
		urlResolver,
		documentServiceFactory,
		clientDetailsOverride: { capabilities: { interactive: true } },
		configProvider: wrapConfigProviderWithDefaults(undefined, {
			"Fluid.Container.ForceWriteConnection": true,
		}),
	};
}

/**
 * A Fluid container backed by tinylicious, implementing {@link @fluidframework/runtime-definitions#FluidContainerWithService}.
 * @internal
 */
export class TinyliciousServiceContainer<TData>
	extends ServiceContainerBase<TData, TinyliciousServiceOptions>
	implements FluidContainerWithService<TData>
{
	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: TinyliciousServiceOptions,
		root: DataStoreKind<T>,
	): Promise<TinyliciousServiceContainer<T>> {
		const loaderOptions = makeContainerLoaderOptions(options);
		const minVersionForCollab = options.minVersionForCollab;

		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "no-dynamic-package", config: {} },
			codeLoader: makeCodeLoader(registry, minVersionForCollab, containerRuntimeLoader, root),
			...loaderOptions,
		});

		return new TinyliciousServiceContainer<T>(
			registry,
			options,
			container,
			(await container.getEntryPoint()) as T,
			undefined,
		);
	}

	public static async load<T>(
		registry: DataStoreRegistry<T>,
		options: TinyliciousServiceOptions,
		id: string,
	): Promise<TinyliciousServiceContainer<T> & FluidContainerAttached<T>> {
		const loaderOptions = makeContainerLoaderOptions(options);
		const minVersionForCollab = options.minVersionForCollab;

		const containerInner = await loadExistingContainer({
			request: { url: id },
			codeLoader: makeCodeLoader(registry, minVersionForCollab, containerRuntimeLoader),
			...loaderOptions,
		});

		const serviceContainer = new TinyliciousServiceContainer<T>(
			registry,
			options,
			containerInner,
			(await containerInner.getEntryPoint()) as T,
			id,
		);
		assert(serviceContainer.id !== undefined, "id should be defined when loading a container");
		return serviceContainer as typeof serviceContainer & { id: string };
	}

	private constructor(
		registry: Registry<Promise<DataStoreKind<TData>>>,
		options: TinyliciousServiceOptions,
		container: IContainer,
		data: TData,
		id: string | undefined,
	) {
		super(registry, options, container, data, id);
	}

	protected createAttachRequest(): IRequest {
		return createTinyliciousCreateNewRequest();
	}
}
