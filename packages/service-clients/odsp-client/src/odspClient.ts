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
import type {
	IDocumentServiceFactory,
	IClient,
	IUrlResolver,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import type { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import type { IRootDataObject } from "@fluidframework/fluid-static/internal";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	createServiceAudience,
} from "@fluidframework/fluid-static/internal";
import {
	OdspDocumentServiceFactory,
	isOdspResolvedUrl,
	createOpenOdspResolvedUrl,
	createCreateOdspResolvedUrl,
} from "@fluidframework/odsp-driver/internal";
import type {
	OdspResourceTokenFetchOptions,
	IOdspOpenArgs,
	IOdspCreateArgs,
} from "@fluidframework/odsp-driver-definitions/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import type {
	TokenResponse,
	OdspClientProps,
	OdspContainerAttachArgs,
	OdspContainerAttachFunctor,
	OdspContainerServices,
	OdspContainerAttachResult,
	OdspContainerOpenOptions,
	OdspConnectionConfig,
	IOdspClient,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";
import { type IOdspTokenProvider } from "./token.js";

type OdspSiteLocation = Omit<OdspConnectionConfig, "tokenProvider">;

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

class OdspFileOpenUrlResolver implements IUrlResolver {
	public constructor(private readonly input: IOdspOpenArgs) {}

	public async resolve(_request: IRequest): Promise<IResolvedUrl | undefined> {
		return createOpenOdspResolvedUrl(this.input);
	}

	public async getAbsoluteUrl(): Promise<string> {
		throw new Error("getAbsoluteUrl() calls are not supported in OdspClient scenarios.");
	}
}

class OdspFileCreateUrlResolver implements IUrlResolver {
	private input?: IOdspCreateArgs;

	public constructor() {}

	public update(input: IOdspCreateArgs): void {
		assert(this.input === undefined, "Can update only once");
		this.input = input;
	}

	public async resolve(_request: IRequest): Promise<IResolvedUrl | undefined> {
		assert(this.input !== undefined, "update() not called");
		return createCreateOdspResolvedUrl(this.input);
	}

	public async getAbsoluteUrl(): Promise<string> {
		throw new Error("getAbsoluteUrl() calls are not supported in OdspClient scenarios.");
	}
}

/**
 * Creates OdspClient
 * @param driverFactory - driver factory to use
 * @param connectionConfig - connection config, specifis token callback and location of the files
 * @param logger - (options) logger to use
 * @param configProvider - (optional) overwrires
 * @returns IOdspClient
 */
function createOdspClientCore(
	driverFactory: IDocumentServiceFactory,
	connectionConfig: OdspSiteLocation,
	logger?: ITelemetryBaseLogger,
	configProvider?: IConfigProviderBase,
): IOdspClient {
	return new OdspClient(driverFactory, connectionConfig, logger, configProvider);
}

/**
 * Creates OdspClient
 * @param properties - properties
 * @returns IOdspClient
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
		properties.connection,
		properties.logger,
		properties.configProvider,
	);
}

/**
 * OdspClient provides the ability to have a Fluid object backed by the ODSP service within the context of Microsoft 365 (M365) tenants.
 */
class OdspClient implements IOdspClient {
	private readonly configProvider: IConfigProviderBase;

	public constructor(
		private readonly documentServiceFactory: IDocumentServiceFactory,
		protected readonly connectionConfig: OdspSiteLocation,
		private readonly logger?: ITelemetryBaseLogger,
		configProvider?: IConfigProviderBase,
	) {
		this.configProvider = wrapConfigProvider(configProvider);
	}

	public async createContainer<T extends ContainerSchema>(
		containerSchema: T,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
		createFn: OdspContainerAttachFunctor;
	}> {
		const resolver = new OdspFileCreateUrlResolver();
		const loader = this.createLoader(containerSchema, resolver);

		const container = await loader.createDetachedContainer({
			package: "no-dynamic-package",
			config: {},
		});

		const rootDataObject = await this.getContainerEntryPoint(container);
		const fluidContainer = createFluidContainer<T>({
			container,
			rootDataObject,
		});

		const createFn = OdspClient.createContainerAttachCallback(
			container,
			this.connectionConfig,
			resolver,
		);

		fluidContainer.attach = async (): Promise<string> => {
			const res = await createFn();
			return res.itemId;
		};

		const services = await this.getContainerServices(container);

		return { container: fluidContainer, services, createFn };
	}

	public async getContainer<T extends ContainerSchema>(
		itemId: string,
		containerSchema: T,
		options?: OdspContainerOpenOptions,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
	}> {
		const resolvedUrl: IOdspOpenArgs = {
			summarizer: false,

			// Identity of a file
			siteUrl: this.connectionConfig.siteUrl,
			driveId: this.connectionConfig.driveId,
			itemId,

			fileVersion: options?.fileVersion,

			sharingLinkToRedeem: options?.sharingLinkToRedeem,

			isClpCompliantApp: this.connectionConfig.isClpCompliant === true,
		};

		const loader = this.createLoader(
			containerSchema,
			new OdspFileOpenUrlResolver(resolvedUrl),
		);
		// Url does not matter, as our URL resolver will provide fixed output.
		// Put some easily editifiable string for easier debugging
		const container = await loader.resolve({ url: "<OdspClient dummy url>" });

		const fluidContainer = createFluidContainer<T>({
			container,
			rootDataObject: await this.getContainerEntryPoint(container),
		});
		const services = await this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	private createLoader(schema: ContainerSchema, urlResolver: IUrlResolver): Loader {
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
			urlResolver,
			documentServiceFactory: this.documentServiceFactory,
			codeLoader,
			logger: this.logger,
			options: { client },
			configProvider: this.configProvider,
		});
	}

	private static createContainerAttachCallback(
		container: IContainer,
		connectionConfig: OdspSiteLocation,
		resolver: OdspFileCreateUrlResolver,
	): OdspContainerAttachFunctor {
		/**
		 * See {@link FluidContainer.attach}
		 */
		return async (odspProps?: OdspContainerAttachArgs): Promise<OdspContainerAttachResult> => {
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state");
			}

			const base = {
				siteUrl: connectionConfig.siteUrl,
				driveId: connectionConfig.driveId,
				isClpCompliantApp: connectionConfig.isClpCompliant === true,
			};

			const resolved: IOdspCreateArgs =
				odspProps !== undefined && "itemId" in odspProps
					? {
							...base,
							itemId: odspProps.itemId,
						}
					: {
							...base,
							filePath: odspProps?.filePath ?? "",
							fileName: odspProps?.fileName ?? uuid(),
							createShareLinkType: odspProps?.createShareLinkType,
						};

			resolver.update(resolved);

			// Url does not matter, as our URL resolver will provide fixed output.
			// Put some easily editifiable string for easier debugging
			await container.attach({ url: "OdspClient dummy url" });

			const resolvedUrl = container.resolvedUrl;

			if (resolvedUrl === undefined || !isOdspResolvedUrl(resolvedUrl)) {
				throw new Error("Resolved Url not available on attached container");
			}

			return {
				itemId: resolvedUrl.itemId,
				shareLinkInfo: resolvedUrl.shareLinkInfo,
			};
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
