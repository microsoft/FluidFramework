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
import type {
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
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
	MinimumVersionForCollab,
	Registry,
	ServiceClient,
} from "@fluidframework/runtime-definitions/internal";
import { ServiceContainerBase } from "@fluidframework/runtime-definitions/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";

import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver.js";
import type { AzureLocalConnectionConfig, AzureRemoteConnectionConfig } from "./interfaces.js";
import { isAzureRemoteConnectionConfig } from "./utils.js";

/**
 * Options for configuring a {@link createAzureServiceClient}.
 * @alpha
 */
export interface AzureServiceOptions {
	readonly connection: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;
	readonly minVersionForCollab: MinimumVersionForCollab;
	readonly logger?: ITelemetryBaseLogger;
	readonly configProvider?: IConfigProviderBase;
}

/**
 * Creates a {@link @fluidframework/runtime-definitions#ServiceClient} backed by Azure Fluid Relay.
 *
 * @remarks
 * For local development, use `connection.type: "local"` and point to a running
 * `@fluidframework/azure-local-service` instance (default port 7071).
 *
 * @alpha
 */
export function createAzureServiceClient(options: AzureServiceOptions): ServiceClient {
	return makeServiceClientImpl(options, AzureServiceContainer);
}

const LOCAL_MODE_TENANT_ID = "local";

function getTenantId(
	connection: AzureRemoteConnectionConfig | AzureLocalConnectionConfig,
): string {
	return isAzureRemoteConnectionConfig(connection)
		? connection.tenantId
		: LOCAL_MODE_TENANT_ID;
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

function makeContainerLoaderOptions(options: AzureServiceOptions): {
	urlResolver: AzureUrlResolver;
	documentServiceFactory: RouterliciousDocumentServiceFactory;
	clientDetailsOverride: { capabilities: { interactive: boolean } };
	configProvider: ReturnType<typeof wrapConfigProviderWithDefaults>;
} {
	const { connection } = options;
	const isRemoteConnection = isAzureRemoteConnectionConfig(connection);
	const documentServiceFactory = new RouterliciousDocumentServiceFactory(
		connection.tokenProvider,
		{
			enableWholeSummaryUpload: isRemoteConnection,
			enableDiscovery: isRemoteConnection,
		},
	);
	const urlResolver = new AzureUrlResolver();

	return {
		urlResolver,
		documentServiceFactory,
		clientDetailsOverride: { capabilities: { interactive: true } },
		configProvider: wrapConfigProviderWithDefaults(options.configProvider, {
			"Fluid.Container.ForceWriteConnection": true,
		}),
	};
}

/**
 * A Fluid container backed by Azure Fluid Relay, implementing
 * {@link @fluidframework/runtime-definitions#FluidContainerWithService}.
 * @internal
 */
export class AzureServiceContainer<TData>
	extends ServiceContainerBase<TData, AzureServiceOptions>
	implements FluidContainerWithService<TData>
{
	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: AzureServiceOptions,
		root: DataStoreKind<T>,
	): Promise<AzureServiceContainer<T>> {
		const loaderOptions = makeContainerLoaderOptions(options);
		const { minVersionForCollab } = options;

		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "no-dynamic-package", config: {} },
			codeLoader: makeCodeLoader(registry, minVersionForCollab, containerRuntimeLoader, root),
			...loaderOptions,
		});

		return new AzureServiceContainer<T>(
			registry,
			options,
			container,
			(await container.getEntryPoint()) as T,
			undefined,
		);
	}

	public static async load<T>(
		registry: DataStoreRegistry<T>,
		options: AzureServiceOptions,
		id: string,
	): Promise<AzureServiceContainer<T> & FluidContainerAttached<T>> {
		const loaderOptions = makeContainerLoaderOptions(options);
		const { minVersionForCollab } = options;

		const { connection } = options;
		const url = new URL(connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(connection.endpoint));
		url.searchParams.append("tenantId", encodeURIComponent(getTenantId(connection)));
		url.searchParams.append("containerId", encodeURIComponent(id));

		const containerInner = await loadExistingContainer({
			request: { url: url.href },
			codeLoader: makeCodeLoader(registry, minVersionForCollab, containerRuntimeLoader),
			...loaderOptions,
		});

		const serviceContainer = new AzureServiceContainer<T>(
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
		options: AzureServiceOptions,
		container: IContainer,
		data: TData,
		id: string | undefined,
	) {
		super(registry, options, container, data, id);
	}

	protected createAttachRequest(): IRequest {
		const { connection } = this.options;
		return createAzureCreateNewRequest(connection.endpoint, getTenantId(connection));
	}
}
