/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import {
	type IContainer,
	type IFluidModuleWithDetails,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import { Loader, loadContainerPaused } from "@fluidframework/container-loader/internal";
import { type FluidObject, type IConfigProviderBase } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { type IClient } from "@fluidframework/driver-definitions";
import {
	type IDocumentServiceFactory,
	type IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { applyStorageCompression } from "@fluidframework/driver-utils/internal";
import { type ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import {
	type IRootDataObject,
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	createServiceAudience,
	type CompatibilityMode,
} from "@fluidframework/fluid-static/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";

import { createAzureAudienceMember } from "./AzureAudience.js";
import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver.js";
import {
	type AzureClientProps,
	type AzureConnectionConfig,
	type AzureContainerServices,
	type AzureContainerVersion,
	type AzureGetVersionsOptions,
} from "./interfaces.js";
import { isAzureRemoteConnectionConfig } from "./utils.js";

/**
 * Strongly typed id for connecting to a local Azure Fluid Relay.
 */
const LOCAL_MODE_TENANT_ID = "local";
const getTenantId = (connectionProperties: AzureConnectionConfig): string => {
	return isAzureRemoteConnectionConfig(connectionProperties)
		? connectionProperties.tenantId
		: LOCAL_MODE_TENANT_ID;
};

const MAX_VERSION_COUNT = 5;

/**
 * Default feature gates.
 * These values will only be used if the feature gate is not already set by the supplied config provider.
 */
const azureClientFeatureGates = {
	// Azure client requires a write connection by default
	"Fluid.Container.ForceWriteConnection": true,
};

/**
 * Feature gates required to support runtime compatibility when V1 and V2 clients are collaborating
 */
const azureClientV1CompatFeatureGates = {
	// Disable Garbage Collection
	"Fluid.GarbageCollection.RunSweep": false, // To prevent the GC op
	"Fluid.GarbageCollection.DisableAutoRecovery": true, // To prevent the GC op
	"Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride": false, // For a consistent story of "GC is disabled"
};

/**
 * Wrap the config provider to fall back on the appropriate defaults for Azure Client.
 * @param baseConfigProvider - The base config provider to wrap
 * @returns A new config provider with the appropriate defaults applied underneath the given provider
 */
function wrapConfigProvider(baseConfigProvider?: IConfigProviderBase): IConfigProviderBase {
	const defaults = {
		...azureClientFeatureGates,
		...azureClientV1CompatFeatureGates,
	};
	return wrapConfigProviderWithDefaults(baseConfigProvider, defaults);
}

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Fluid Relay or,
 * when running with local tenantId, have it be backed by a local Azure Fluid Relay instance.
 * @public
 */
export class AzureClient {
	private readonly documentServiceFactory: IDocumentServiceFactory;
	private readonly urlResolver: IUrlResolver;
	private readonly configProvider: IConfigProviderBase | undefined;

	/**
	 * Creates a new client instance using configuration parameters.
	 * @param properties - Properties for initializing a new AzureClient instance
	 */
	public constructor(private readonly properties: AzureClientProps) {
		// remove trailing slash from URL if any
		properties.connection.endpoint = properties.connection.endpoint.replace(/\/$/, "");
		this.urlResolver = new AzureUrlResolver();
		// The local service implementation differs from the Azure Fluid Relay in blob
		// storage format. Azure Fluid Relay supports whole summary upload. Local currently does not.
		const isRemoteConnection = isAzureRemoteConnectionConfig(this.properties.connection);
		const origDocumentServiceFactory: IDocumentServiceFactory =
			new RouterliciousDocumentServiceFactory(this.properties.connection.tokenProvider, {
				enableWholeSummaryUpload: isRemoteConnection,
				enableDiscovery: isRemoteConnection,
			});

		this.documentServiceFactory = applyStorageCompression(
			origDocumentServiceFactory,
			properties.summaryCompression,
		);
		this.configProvider = wrapConfigProvider(properties.configProvider);
	}

	/**
	 * Creates a new detached container instance in the Azure Fluid Relay.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param containerSchema - Container schema for the new container.
	 * @param compatibilityMode - Compatibility mode the container should run in.
	 * @returns New detached container instance along with associated services.
	 */
	public async createContainer<const TContainerSchema extends ContainerSchema>(
		containerSchema: TContainerSchema,
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: AzureContainerServices;
	}> {
		const loader = this.createLoader(containerSchema, compatibilityMode);

		const container = await loader.createDetachedContainer({
			package: "no-dynamic-package",
			config: {},
		});

		const fluidContainer = await this.createFluidContainer<TContainerSchema>(
			container,
			this.properties.connection,
		);
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Accesses the existing container given its unique ID in the Azure Fluid Relay.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param id - Unique ID of the container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param compatibilityMode - Compatibility mode the container should run in.
	 * @returns Existing container instance along with associated services.
	 */
	public async getContainer<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: AzureContainerServices;
	}> {
		const loader = this.createLoader(containerSchema, compatibilityMode);
		const url = new URL(this.properties.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.properties.connection.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.properties.connection)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));
		const container = await loader.resolve({ url: url.href });
		const rootDataObject = await this.getContainerEntryPoint(container);
		const fluidContainer = createFluidContainer<TContainerSchema>({
			container,
			rootDataObject,
		});
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Load a specific version of a container for viewing only.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param version - Unique version of the source container in Azure Fluid Relay.
	 * @param compatibilityMode - Compatibility mode the container should run in.
	 * @returns Loaded container instance at the specified version.
	 */
	public async viewContainerVersion<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		version: AzureContainerVersion,
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
	}> {
		const loader = this.createLoader(containerSchema, compatibilityMode);
		const url = new URL(this.properties.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.properties.connection.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.properties.connection)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));
		const container = await loadContainerPaused(loader, {
			url: url.href,
			headers: { [LoaderHeader.version]: version.id },
		});
		const rootDataObject = await this.getContainerEntryPoint(container);
		const fluidContainer = createFluidContainer<TContainerSchema>({
			container,
			rootDataObject,
		});
		return { container: fluidContainer };
	}

	/**
	 * Get the list of versions for specific container.
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param options - "Get" options. If options are not provided, API
	 * will assume maxCount of versions to retrieve to be 5.
	 * @returns Array of available container versions.
	 */
	public async getContainerVersions(
		id: string,
		options?: AzureGetVersionsOptions,
	): Promise<AzureContainerVersion[]> {
		const url = new URL(this.properties.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.properties.connection.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.properties.connection)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));

		const resolvedUrl = await this.urlResolver.resolve({ url: url.href });
		if (!resolvedUrl) {
			throw new Error("Unable to resolved URL");
		}
		const documentService =
			await this.documentServiceFactory.createDocumentService(resolvedUrl);
		const storage = await documentService.connectToStorage();

		// External API uses null
		// eslint-disable-next-line unicorn/no-null
		const versions = await storage.getVersions(null, options?.maxCount ?? MAX_VERSION_COUNT);

		return versions.map((item) => {
			return { id: item.id, date: item.date };
		});
	}

	private getContainerServices(container: IContainer): AzureContainerServices {
		return {
			audience: createServiceAudience({
				container,
				createServiceMember: createAzureAudienceMember,
			}),
		};
	}

	private createLoader(schema: ContainerSchema, compatibilityMode: CompatibilityMode): Loader {
		const runtimeFactory = createDOProviderContainerRuntimeFactory({
			schema,
			compatibilityMode,
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
			logger: this.properties.logger,
			options: { client },
			configProvider: this.configProvider,
		});
	}

	private async createFluidContainer<TContainerSchema extends ContainerSchema>(
		container: IContainer,
		connection: AzureConnectionConfig,
	): Promise<IFluidContainer<TContainerSchema>> {
		const createNewRequest = createAzureCreateNewRequest(
			connection.endpoint,
			getTenantId(connection),
		);

		const rootDataObject = await this.getContainerEntryPoint(container);

		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (): Promise<string> => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- AB#7608
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state");
			}
			await container.attach(createNewRequest);
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			return container.resolvedUrl.id;
		};
		const fluidContainer = createFluidContainer<TContainerSchema>({
			container,
			rootDataObject,
		});
		fluidContainer.attach = attach;
		return fluidContainer;
	}

	private async getContainerEntryPoint(container: IContainer): Promise<IRootDataObject> {
		const rootDataObject: FluidObject<IRootDataObject> = await container.getEntryPoint();
		assert(
			rootDataObject.IRootDataObject !== undefined,
			0x90a /* entryPoint must be of type IRootDataObject */,
		);
		return rootDataObject.IRootDataObject;
	}
	// #endregion
}
