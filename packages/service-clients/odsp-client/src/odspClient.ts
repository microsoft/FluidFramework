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
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type {
	FluidObject,
	IConfigProviderBase,
	IFluidHandle,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/driver-definitions";
import type { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import type { ContainerAttachProps, ContainerSchema } from "@fluidframework/fluid-static";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	isInternalFluidContainer,
} from "@fluidframework/fluid-static/internal";
import {
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	createOdspCreateContainerRequest,
	createOdspUrl,
	isOdspResolvedUrl,
} from "@fluidframework/odsp-driver/internal";
import type {
	IOdspResolvedUrl,
	OdspResourceTokenFetchOptions,
} from "@fluidframework/odsp-driver-definitions/internal";
import { lookupTemporaryBlobStorageId } from "@fluidframework/runtime-utils/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import type {
	TokenResponse,
	OdspClientProps,
	OdspConnectionConfig,
	OdspContainerAttachProps,
	OdspContainerServices as IOdspContainerServices,
	IOdspFluidContainer,
} from "./interfaces.js";
import { OdspContainerServices } from "./odspContainerServices.js";
import { buildOdspBlobContentUrl } from "./odspUrls.js";
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
		container: IOdspFluidContainer<T>;
		services: IOdspContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(containerSchema);

		const container = await createDetachedContainer({
			...loaderProps,
			codeDetails: {
				package: "no-dynamic-package",
				config: {},
			},
		});

		const fluidContainer = await this.createFluidContainer<T>(
			container,
			this.connectionConfig,
		);

		const services = await this.getContainerServices(container);

		return { container: fluidContainer, services };
	}

	public async getContainer<T extends ContainerSchema>(
		id: string,
		containerSchema: T,
	): Promise<{
		container: IOdspFluidContainer<T>;
		services: IOdspContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(containerSchema);
		const url = createOdspUrl({
			siteUrl: this.connectionConfig.siteUrl,
			driveId: this.connectionConfig.driveId,
			itemId: id,
			dataStorePath: "",
		});
		const container = await loadExistingContainer({ ...loaderProps, request: { url } });

		const fluidContainer = await createFluidContainer<T>({
			container,
		});
		if (!isInternalFluidContainer(fluidContainer)) {
			throw new Error("Fluid container is not internal");
		}
		const services = await this.getContainerServices(container);
		return { container: fluidContainer, services };
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

	private async createFluidContainer<T extends ContainerSchema>(
		container: IContainer,
		connection: OdspConnectionConfig,
	): Promise<IOdspFluidContainer<T>> {
		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (
			odspProps?: ContainerAttachProps<OdspContainerAttachProps>,
		): Promise<string> => {
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
		const fluidContainer = await createFluidContainer<T>({ container });
		if (!isInternalFluidContainer(fluidContainer)) {
			throw new Error("Fluid container is not internal");
		}
		fluidContainer.attach = attach;
		return fluidContainer;
	}

	private async getContainerServices(container: IContainer): Promise<IOdspContainerServices> {
		const containerRuntime = await this.getContainerRuntime(container);
		const resolvedUrl = container.resolvedUrl;
		const odspResolvedUrl =
			resolvedUrl && isOdspResolvedUrl(resolvedUrl) ? resolvedUrl : undefined;

		// Create a partially-applied function to lookup blob URLs
		const lookupBlobUrl =
			containerRuntime !== undefined && odspResolvedUrl !== undefined
				? (handle: IFluidHandle): string | undefined =>
						this.buildOdspBlobUrl(containerRuntime, handle, odspResolvedUrl)
				: undefined;

		return new OdspContainerServices(container, lookupBlobUrl);
	}

	/**
	 * Build an ODSP blob URL from a handle.
	 * @param containerRuntime - The container runtime to lookup the storage ID from
	 * @param handle - The blob handle to lookup
	 * @param resolvedUrl - The ODSP resolved URL containing endpoint information
	 * @returns The blob URL if the handle points to a non-pending blob, undefined otherwise
	 */
	private buildOdspBlobUrl(
		containerRuntime: IContainerRuntime,
		handle: IFluidHandle,
		resolvedUrl: IOdspResolvedUrl,
	): string | undefined {
		const storageId = lookupTemporaryBlobStorageId(containerRuntime, handle);
		if (storageId === undefined) {
			return undefined;
		}

		const attachmentGETUrl = resolvedUrl.endpoints.attachmentGETStorageUrl;
		if (!attachmentGETUrl) {
			return undefined;
		}

		return buildOdspBlobContentUrl(attachmentGETUrl, storageId);
	}

	private async getContainerRuntime(
		container: IContainer,
	): Promise<IContainerRuntime | undefined> {
		const entryPoint = await container.getEntryPoint();
		if (
			entryPoint !== undefined &&
			typeof (entryPoint as IMaybeFluidObjectWithContainerRuntime).IStaticEntryPoint
				?.extensionStore === "object"
		) {
			// If the container has a static entry point with an extension store, use that to get the runtime
			return (entryPoint as IMaybeFluidObjectWithContainerRuntime).IStaticEntryPoint
				.extensionStore;
		}

		return undefined;
	}
}

/**
 * Type guard interface to access the container runtime from the entry point.
 *
 * @remarks
 * The "Maybe" prefix indicates this interface represents a type guard pattern where the property
 * may or may not exist at runtime. fluid-static guarantees this exists on the container's entry
 * point via IStaticEntryPoint, but a runtime check is performed in `getContainerRuntime` to handle
 * cases where the entry point structure differs.
 */
interface IMaybeFluidObjectWithContainerRuntime extends FluidObject {
	IStaticEntryPoint: {
		extensionStore: IContainerRuntime;
	};
}
