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
import {
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	createOdspCreateContainerRequest,
	createOdspUrl,
} from "@fluidframework/odsp-driver/internal";
import type { OdspResourceTokenFetchOptions } from "@fluidframework/odsp-driver-definitions/internal";
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
import { v4 as uuid } from "uuid";

import type { OdspConnectionConfig, TokenResponse } from "./interfaces.js";

/**
 * Options for configuring a {@link createOdspServiceClient}.
 * @alpha
 */
export interface OdspServiceOptions {
	readonly connection: OdspConnectionConfig;
	readonly minVersionForCollab: MinimumVersionForCollab;
	readonly logger?: ITelemetryBaseLogger;
	readonly configProvider?: IConfigProviderBase;
}

/**
 * Creates a ServiceClient backed by ODSP (OneDrive/SharePoint).
 *
 * @remarks
 * Requires a Microsoft 365 tenant with appropriate permissions. Provide a {@link OdspConnectionConfig}
 * with a `tokenProvider` that implements {@link IOdspTokenProvider}.
 *
 * @alpha
 */
export function createOdspServiceClient(options: OdspServiceOptions): ServiceClient {
	return makeServiceClientImpl(options, OdspServiceContainer);
}

async function getStorageToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: OdspConnectionConfig["tokenProvider"],
): Promise<TokenResponse> {
	return tokenProvider.fetchStorageToken(options.siteUrl, options.refresh);
}

async function getWebsocketToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: OdspConnectionConfig["tokenProvider"],
): Promise<TokenResponse> {
	return tokenProvider.fetchWebsocketToken(options.siteUrl, options.refresh);
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

function makeContainerLoaderOptions(options: OdspServiceOptions): {
	urlResolver: OdspDriverUrlResolver;
	documentServiceFactory: OdspDocumentServiceFactory;
	clientDetailsOverride: { capabilities: { interactive: boolean } };
	configProvider: ReturnType<typeof wrapConfigProviderWithDefaults>;
} {
	const { connection } = options;
	const documentServiceFactory = new OdspDocumentServiceFactory(
		async (tokenOptions) => getStorageToken(tokenOptions, connection.tokenProvider),
		async (tokenOptions) => getWebsocketToken(tokenOptions, connection.tokenProvider),
	);
	const urlResolver = new OdspDriverUrlResolver();

	return {
		urlResolver,
		documentServiceFactory,
		clientDetailsOverride: { capabilities: { interactive: true } },
		configProvider: wrapConfigProviderWithDefaults(options.configProvider, {}),
	};
}

/**
 * A Fluid container backed by ODSP (OneDrive/SharePoint), implementing
 * {@link @fluidframework/runtime-definitions#FluidContainerWithService}.
 *
 * @remarks
 * The container ID (used for `ServiceClient.loadContainer`) is the ODSP `itemId`,
 * which is assigned by the service when `attach` is called.
 *
 * @internal
 */
export class OdspServiceContainer<TData>
	extends ServiceContainerBase<TData, OdspServiceOptions>
	implements FluidContainerWithService<TData>
{
	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: OdspServiceOptions,
		root: DataStoreKind<T>,
	): Promise<OdspServiceContainer<T>> {
		const loaderOptions = makeContainerLoaderOptions(options);
		const { minVersionForCollab } = options;

		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "no-dynamic-package", config: {} },
			codeLoader: makeCodeLoader(registry, minVersionForCollab, containerRuntimeLoader, root),
			...loaderOptions,
		});

		return new OdspServiceContainer<T>(
			registry,
			options,
			container,
			(await container.getEntryPoint()) as T,
			undefined,
		);
	}

	public static async load<T>(
		registry: DataStoreRegistry<T>,
		options: OdspServiceOptions,
		id: string,
	): Promise<OdspServiceContainer<T> & FluidContainerAttached<T>> {
		const loaderOptions = makeContainerLoaderOptions(options);
		const { minVersionForCollab } = options;

		const { connection } = options;
		const url = createOdspUrl({
			siteUrl: connection.siteUrl,
			driveId: connection.driveId,
			itemId: id,
			dataStorePath: "",
		});

		const containerInner = await loadExistingContainer({
			request: { url },
			codeLoader: makeCodeLoader(registry, minVersionForCollab, containerRuntimeLoader),
			...loaderOptions,
		});

		const serviceContainer = new OdspServiceContainer<T>(
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
		options: OdspServiceOptions,
		container: IContainer,
		data: TData,
		id: string | undefined,
	) {
		super(registry, options, container, data, id);
	}

	protected createAttachRequest(): IRequest {
		const { connection } = this.options;
		return createOdspCreateContainerRequest(
			connection.siteUrl,
			connection.driveId,
			connection.filePath,
			uuid(),
		);
	}
}
