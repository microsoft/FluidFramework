/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type {
	FluidObject,
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IClient } from "@fluidframework/driver-definitions";
import type { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import type {
	ContainerAttachProps,
	ContainerSchema,
	IFluidContainer,
} from "@fluidframework/fluid-static";
import type { IRootDataObject } from "@fluidframework/fluid-static/internal";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	createServiceAudience,
} from "@fluidframework/fluid-static/internal";
import {
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	// eslint-disable-next-line import/no-deprecated
	createOdspCreateContainerRequest,
	createOdspUrl,
	isOdspResolvedUrl,
} from "@fluidframework/odsp-driver/internal";
import type { OdspResourceTokenFetchOptions } from "@fluidframework/odsp-driver-definitions/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import type { TokenResponse } from "./interfaces.js";
import type {
	OdspClientProps,
	OdspConnectionConfig,
	OdspContainerAttachProps,
	OdspContainerServices,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";
import type { IOdspTokenProvider } from "./token.js";

async function getStorageToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: IOdspTokenProvider,
): Promise<TokenResponse> {
	const tokenResponse: TokenResponse = await tokenProvider.fetchStorageToken(
		options.siteUrl,
		options.refresh,
	);
	return tokenResponse;
}

async function getWebsocketToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: IOdspTokenProvider,
): Promise<TokenResponse> {
	const tokenResponse: TokenResponse = await tokenProvider.fetchWebsocketToken(
		options.siteUrl,
		options.refresh,
	);
	return tokenResponse;
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
 * OdspClient provides the ability to have a Fluid object backed by the ODSP service within the context of Microsoft 365 (M365) tenants.
 * @sealed
 * @beta
 */
export class OdspClient {
	private readonly documentServiceFactory: IDocumentServiceFactory;
	private readonly urlResolver: OdspDriverUrlResolver;
	private readonly configProvider: IConfigProviderBase | undefined;
	private readonly connectionConfig: OdspConnectionConfig;
	private readonly logger: ITelemetryBaseLogger | undefined;

	public constructor(properties: OdspClientProps) {
		this.connectionConfig = properties.connection;
		this.logger = properties.logger;
		this.documentServiceFactory = new OdspDocumentServiceFactory(
			async (options) => getStorageToken(options, this.connectionConfig.tokenProvider),
			async (options) => getWebsocketToken(options, this.connectionConfig.tokenProvider),
		);

		this.urlResolver = new OdspDriverUrlResolver();
		this.configProvider = wrapConfigProvider(properties.configProvider);
	}

	public async createContainer<T extends ContainerSchema>(
		containerSchema: T,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(containerSchema);

		const container = await createDetachedContainer({
			...loaderProps,
			codeDetails: {
				package: "no-dynamic-package",
				config: {},
			},
		});

		const fluidContainer = await this.createFluidContainer(container, this.connectionConfig);

		const services = await this.getContainerServices(container);

		return { container: fluidContainer as IFluidContainer<T>, services };
	}

	public async getContainer<T extends ContainerSchema>(
		id: string,
		containerSchema: T,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(containerSchema);
		const url = createOdspUrl({
			siteUrl: this.connectionConfig.siteUrl,
			driveId: this.connectionConfig.driveId,
			itemId: id,
			dataStorePath: "",
		});
		const container = await loadExistingContainer({ ...loaderProps, request: { url } });

		const fluidContainer = createFluidContainer({
			container,
			rootDataObject: await this.getContainerEntryPoint(container),
		});
		const services = await this.getContainerServices(container);
		return { container: fluidContainer as IFluidContainer<T>, services };
	}

	private getLoaderProps(schema: ContainerSchema): ILoaderProps {
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

		return {
			urlResolver: this.urlResolver,
			documentServiceFactory: this.documentServiceFactory,
			codeLoader,
			logger: this.logger,
			options: { client },
			configProvider: this.configProvider,
		};
	}

	private async createFluidContainer(
		container: IContainer,
		connection: OdspConnectionConfig,
	): Promise<IFluidContainer> {
		const rootDataObject = await this.getContainerEntryPoint(container);

		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (
			odspProps?: ContainerAttachProps<OdspContainerAttachProps>,
		): Promise<string> => {
			// eslint-disable-next-line import/no-deprecated
			const createNewRequest: IRequest = createOdspCreateContainerRequest(
				connection.siteUrl,
				connection.driveId,
				odspProps?.filePath ?? "",
				odspProps?.fileName ?? uuid(),
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
			return resolvedUrl.itemId;
		};
		const fluidContainer = createFluidContainer({ container, rootDataObject });
		fluidContainer.attach = attach;
		return fluidContainer;
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
