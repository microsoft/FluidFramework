/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	type FluidObject,
	type IConfigProviderBase,
	type IRequest,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IClient } from "@fluidframework/driver-definitions";
import type { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import type { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import type { IRootDataObject } from "@fluidframework/fluid-static/internal";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	createServiceAudience,
} from "@fluidframework/fluid-static/internal";
import {
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	createOdspCreateContainerRequest,
	createOdspUrl,
	isOdspResolvedUrl,
	SharingLinkHeader,
	type OdspFluidDataStoreLocator,
	storeLocatorInOdspUrl,
} from "@fluidframework/odsp-driver/internal";
import type { OdspResourceTokenFetchOptions } from "@fluidframework/odsp-driver-definitions/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import type {
	TokenResponse,
	OdspClientProps,
	OdspSiteIdentification,
	OdspContainerAttachArgType,
	OdspContainerAttachType,
	OdspContainerServices,
	OdspContainerAttachReturnType,
	OdspGetContainerArgType,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";
import { type IOdspTokenProvider } from "./token.js";

async function getStorageToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: IOdspTokenProvider,
): Promise<TokenResponse> {
	return tokenProvider.fetchStorageToken(options.siteUrl, options.refresh);
}

async function getWebsocketToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: IOdspTokenProvider,
): Promise<TokenResponse> {
	return tokenProvider.fetchWebsocketToken(options.siteUrl, options.refresh);
}

/**
 * Default feature gates.
 * These values will only be used if the feature gate is not already set by the supplied config provider.
 */
const odspClientFeatureGates = {
	// None yet
};

/**
 * Wrap the config provider to fall back on the appropriate defaults for ODSP Client.
 * @param baseConfigProvider - The base config provider to wrap
 * @returns A new config provider with the appropriate defaults applied underneath the given provider
 */
function wrapConfigProvider(baseConfigProvider?: IConfigProviderBase): IConfigProviderBase {
	return wrapConfigProviderWithDefaults(baseConfigProvider, odspClientFeatureGates);
}

/**
 * Creates OdspClient
 * @param properties - properties
 * @returns OdspClient
 */
function createOdspClientCore(
	driverFactory: IDocumentServiceFactory,
	urlResolver: OdspDriverUrlResolver,
	connectionConfig: OdspSiteIdentification,
	logger?: ITelemetryBaseLogger,
	configProvider?: IConfigProviderBase,
): IOdspClient {
	return new OdspClient(driverFactory, urlResolver, connectionConfig, logger, configProvider);
}

/**
 * Creates OdspClient
 * @param properties - properties
 * @returns OdspClient
 * @alpha
 */
export function createOdspClient(properties: OdspClientProps): IOdspClient {
	return createOdspClientCore(
		new OdspDocumentServiceFactory(
			async (options) => getStorageToken(options, properties.connection.tokenProvider),
			async (options) => getWebsocketToken(options, properties.connection.tokenProvider),
			properties.persistedCache,
			properties.hostPolicy,
		),
		new OdspDriverUrlResolver(),
		properties.connection,
		properties.logger,
		properties.configProvider,
	);
}

/**
 * Fluid Container type
 * @alpha
 */
export type IOdspFluidContainer<TContainerSchema extends ContainerSchema = ContainerSchema> =
	IFluidContainer<TContainerSchema, OdspContainerAttachType>;

/**
 * IOdspClient provides the ability to manipulate Fluid containers backed by the ODSP service within the context of Microsoft 365 (M365) tenants.
 * @alpha
 */
export interface IOdspClient {
	/**
	 * Creates a new container in memory. Calling attach() on returned container will create container in storage.
	 * @param containerSchema - schema of the created container
	 */
	createContainer<T extends ContainerSchema>(
		containerSchema: T,
	): Promise<{
		container: IOdspFluidContainer<T>;
		services: OdspContainerServices;
	}>;

	/**
	 * Opens existing container. If container does not exist, the call will fail with an error with errorType = DriverErrorTypes.fileNotFoundOrAccessDeniedError.
	 * @param request - identification of the container
	 * @param containerSchema - schema of the container.
	 */
	getContainer<T extends ContainerSchema>(
		request: OdspGetContainerArgType,
		containerSchema: T,
	): Promise<{
		container: IOdspFluidContainer<T>;
		services: OdspContainerServices;
	}>;
}

/**
 * OdspClient provides the ability to have a Fluid object backed by the ODSP service within the context of Microsoft 365 (M365) tenants.
 */
class OdspClient implements IOdspClient {
	private readonly configProvider: IConfigProviderBase;

	public constructor(
		private readonly documentServiceFactory: IDocumentServiceFactory,
		private readonly urlResolver: OdspDriverUrlResolver,
		protected readonly connectionConfig: OdspSiteIdentification,
		private readonly logger?: ITelemetryBaseLogger,
		configProvider?: IConfigProviderBase,
	) {
		this.configProvider = wrapConfigProvider(configProvider);
	}

	public async createContainer<T extends ContainerSchema>(
		containerSchema: T,
	): Promise<{
		container: IOdspFluidContainer<T>;
		services: OdspContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);

		const container = await loader.createDetachedContainer({
			package: "no-dynamic-package",
			config: {},
		});

		const rootDataObject = await this.getContainerEntryPoint(container);
		const fluidContainer = createFluidContainer<T, OdspContainerAttachType>({
			container,
			rootDataObject,
		}) as IOdspFluidContainer<T>;

		OdspClient.addAttachCallback(container, fluidContainer, this.connectionConfig);

		const services = await this.getContainerServices(container);

		return { container: fluidContainer, services };
	}

	public async getContainer<T extends ContainerSchema>(
		request: OdspGetContainerArgType,
		containerSchema: T,
	): Promise<{
		container: IOdspFluidContainer<T>;
		services: OdspContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);

		const locator: OdspFluidDataStoreLocator = {
			siteUrl: this.connectionConfig.siteUrl,
			driveId: this.connectionConfig.driveId,
			itemId: request.itemId,
			dataStorePath: "",
		}
		const url = new URL(baseUrl);
		storeLocatorInOdspUrl(url, locator);
		// return url.href;

		const container = await loader.resolve({
			url: createOdspUrl(locator),
			headers: {
				[SharingLinkHeader.isSharingLinkToRedeem]: request.sharingLinkToRedeem !== undefined,
			},
		});

		const fluidContainer = createFluidContainer<T, OdspContainerAttachType>({
			container,
			rootDataObject: await this.getContainerEntryPoint(container),
		});
		const services = await this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	private createLoader(schema: ContainerSchema): Loader {
		const runtimeFactory = createDOProviderContainerRuntimeFactory({
			schema,
			compatibilityMode: "2",
		});
		const load = async (): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport: runtimeFactory },
				details: { package: "no-dynamic-package", config: {} },
			};
		};

		const codeLoader = { load };
		const client: IClient = {
			details: {
				capabilities: { interactive: true },
			},
			permission: [],
			scopes: [],
			user: { id: "" },
			mode: "write",
		};

		return new Loader({
			urlResolver: this.urlResolver,
			documentServiceFactory: this.documentServiceFactory,
			codeLoader,
			logger: this.logger,
			options: { client },
			configProvider: this.configProvider,
		});
	}

	private static addAttachCallback<T extends ContainerSchema>(
		container: IContainer,
		fluidContainer: IOdspFluidContainer<T>,
		connectionConfig: OdspSiteIdentification,
	): void {
		/**
		 * See {@link FluidContainer.attach}
		 */
		fluidContainer.attach = async (
			odspProps?: OdspContainerAttachArgType,
		): Promise<OdspContainerAttachReturnType> => {
			const createNewRequest: IRequest =
				odspProps !== undefined && "itemId" in odspProps
					? {
							url: createOdspUrl({
								siteUrl: connectionConfig.siteUrl,
								driveId: connectionConfig.driveId,
								itemId: odspProps.itemId,
								dataStorePath: "",
							}),
						}
					: createOdspCreateContainerRequest(
							connectionConfig.siteUrl,
							connectionConfig.driveId,
							odspProps?.filePath ?? "",
							odspProps?.fileName ?? uuid(),
							odspProps?.createShareLinkType,
						);
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state");
			}
			await container.attach(createNewRequest);

			const resolvedUrl = container.resolvedUrl;

			if (resolvedUrl === undefined || !isOdspResolvedUrl(resolvedUrl)) {
				throw new Error("Resolved Url not available on attached container");
			}

			/**
			 * A unique identifier for the file within the provided SharePoint Embedded container ID. When you attach a container,
			 * a new `itemId` is created in the user's drive, which developers can use for various operations
			 * like updating, renaming, moving the Fluid file, changing permissions, and more. `itemId` is used to load the container.
			 */
			return { itemId: resolvedUrl.itemId, shareLinkInfo: resolvedUrl.shareLinkInfo };
		};
	}

	private async getContainerServices(container: IContainer): Promise<OdspContainerServices> {
		return {
			audience: createServiceAudience({
				container,
				createServiceMember: createOdspAudienceMember,
			}),
		};
	}

	private async getContainerEntryPoint(container: IContainer): Promise<IRootDataObject> {
		const rootDataObject: FluidObject<IRootDataObject> = await container.getEntryPoint();
		assert(
			rootDataObject.IRootDataObject !== undefined,
			0x878 /* entryPoint must be of type IRootDataObject */,
		);
		return rootDataObject.IRootDataObject;
	}
}
