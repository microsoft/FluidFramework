/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	AttachState,
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { applyStorageCompression } from "@fluidframework/driver-utils";
import {
	ContainerSchema,
	DOProviderContainerRuntimeFactory,
	FluidContainer,
	IFluidContainer,
	IRootDataObject,
} from "@fluidframework/fluid-static";
import { IClient, SummaryType } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { AzureAudience } from "./AzureAudience";
import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver";
import {
	AzureClientProps,
	AzureConnectionConfig,
	AzureContainerServices,
	AzureContainerVersion,
	AzureGetVersionsOptions,
} from "./interfaces";
import { isAzureRemoteConnectionConfig } from "./utils";

/**
 * Strongly typed id for connecting to a local Azure Fluid Relay.
 */
const LOCAL_MODE_TENANT_ID = "local";
const getTenantId = (connectionProps: AzureConnectionConfig): string => {
	return isAzureRemoteConnectionConfig(connectionProps)
		? connectionProps.tenantId
		: LOCAL_MODE_TENANT_ID;
};

const MAX_VERSION_COUNT = 5;

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Fluid Relay or,
 * when running with a local tenantId, have it be backed by a local Azure Fluid Relay instance.
 *
 * @remarks
 * This class serves as the main entry point for any client-side operations in Azure Fluid.
 *
 * @example
 * ```typescript
 * import { AzureClient, AzureConnectionConfig } from "@fluidframework/azure-client";
 * import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
 *
 * const clientProps = {
 * 	connection: {
 * 		type: "local",
 * 		tokenProvider: new InsecureTokenProvider("fooBar", { id: "123", name: "Test User" }),
 * 		endpoint: "http://localhost:7070",
 * 	},
 * };
 * const azureClient = new AzureClient(clientProps);
 * ```
 *
 * @public
 */
export class AzureClient {
	/**
	 * The document service factory used for creating and interacting with Fluid documents.
	 */
	private readonly documentServiceFactory: IDocumentServiceFactory;

	/**
	 * The URL resolver for resolving URLs to Fluid documents.
	 */
	private readonly urlResolver: IUrlResolver;

	/**
	 * Optional configuration provider for telemetry.
	 */
	private readonly configProvider: IConfigProviderBase | undefined;

	/**
	 * Creates a new client instance using configuration parameters.
	 * @param props - Properties for initializing a new AzureClient instance
	 *
	 * @public
	 */
	public constructor(private readonly props: AzureClientProps) {
		// remove trailing slash from URL if any
		props.connection.endpoint = props.connection.endpoint.replace(/\/$/, "");
		this.urlResolver = new AzureUrlResolver();
		// The local service implementation differs from the Azure Fluid Relay in blob
		// storage format. Azure Fluid Relay supports whole summary upload. Local currently does not.
		const isRemoteConnection = isAzureRemoteConnectionConfig(this.props.connection);
		const origDocumentServiceFactory: IDocumentServiceFactory =
			new RouterliciousDocumentServiceFactory(this.props.connection.tokenProvider, {
				enableWholeSummaryUpload: isRemoteConnection,
				enableDiscovery: isRemoteConnection,
			});

		this.documentServiceFactory = applyStorageCompression(
			origDocumentServiceFactory,
			props.summaryCompression,
		);
		this.configProvider = props.configProvider;
	}

	/**
	 * Creates a new detached container instance in the Azure Fluid Relay service.
	 * @param containerSchema - The schema defining the new container.
	 * @returns A promise that resolves to the new detached container instance and its associated services.
	 *
	 * @example
	 * ```typescript
	 * let container: IFluidContainer;
	 * const containerId = window.location.hash.substring(1);
	 * if (!containerId) {
	 *     ({ container } = await client.createContainer(containerSchema));
	 *     const id = await container.attach();
	 *     window.location.hash = id;
	 *     // Return the Fluid SharedString object.
	 *     return container.initialObjects.sharedString as SharedString;
	 * }
	 *
	 * ({ container } = await client.getContainer(containerId, containerSchema));
	 * if (container.connectionState !== ConnectionState.Connected) {
	 *     await new Promise<void>((resolve) => {
	 *         container.once("connected", () => {
	 *             resolve();
	 *         });
	 *     });
	 * }
	 * ```
	 *
	 * @public
	 */
	public async createContainer(containerSchema: ContainerSchema): Promise<{
		container: IFluidContainer;
		services: AzureContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);

		const container = await loader.createDetachedContainer({
			package: "no-dynamic-package",
			config: {},
		});

		const fluidContainer = await this.createFluidContainer(container, this.props.connection);
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Creates new detached container out of specific version of another container.
	 *
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param version - Unique version of the source container in Azure Fluid Relay.
	 * @defaultValue latest. It defaults to latest version if parameter not provided.
	 * @returns New detached container instance along with associated services.
	 * @throws Will throw an error if the source container's URL cannot be resolved.
	 *
	 * @public
	 */
	public async copyContainer(
		id: string,
		containerSchema: ContainerSchema,
		version?: AzureContainerVersion,
	): Promise<{
		container: IFluidContainer;
		services: AzureContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);
		const url = new URL(this.props.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.props.connection.endpoint));
		url.searchParams.append("tenantId", encodeURIComponent(getTenantId(this.props.connection)));
		url.searchParams.append("containerId", encodeURIComponent(id));
		const sourceContainer = await loader.resolve({ url: url.href });

		if (sourceContainer.resolvedUrl === undefined) {
			throw new Error("Source container cannot resolve URL.");
		}

		const documentService = await this.documentServiceFactory.createDocumentService(
			sourceContainer.resolvedUrl,
		);
		const storage = await documentService.connectToStorage();
		const handle = {
			type: SummaryType.Handle,
			handleType: SummaryType.Tree,
			handle: version?.id ?? "latest",
		};
		const tree = await storage.downloadSummary(handle);

		const container = await loader.rehydrateDetachedContainerFromSnapshot(JSON.stringify(tree));

		const fluidContainer = await this.createFluidContainer(container, this.props.connection);
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Accesses the existing container given its unique ID in the Azure Fluid Relay.
	 * @param id - Unique ID of the container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @returns Existing container instance along with associated services.
	 * @public
	 */
	public async getContainer(
		id: string,
		containerSchema: ContainerSchema,
	): Promise<{
		container: IFluidContainer;
		services: AzureContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);
		const url = new URL(this.props.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.props.connection.endpoint));
		url.searchParams.append("tenantId", encodeURIComponent(getTenantId(this.props.connection)));
		url.searchParams.append("containerId", encodeURIComponent(id));
		const container = await loader.resolve({ url: url.href });
		const rootDataObject = await requestFluidObject<IRootDataObject>(container, "/");
		const fluidContainer = new FluidContainer(container, rootDataObject);
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Get the list of versions for specific container.
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param options - "Get" options.
	 * @defaultValue 5. If options are not provided, API will assume maxCount of versions to retreive to be 5.
	 * @returns Array of available container versions.
	 * @throws Will throw an error if the URL cannot be resolved.
	 * @public
	 */
	public async getContainerVersions(
		id: string,
		options?: AzureGetVersionsOptions,
	): Promise<AzureContainerVersion[]> {
		const url = new URL(this.props.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.props.connection.endpoint));
		url.searchParams.append("tenantId", encodeURIComponent(getTenantId(this.props.connection)));
		url.searchParams.append("containerId", encodeURIComponent(id));

		const resolvedUrl = await this.urlResolver.resolve({ url: url.href });
		if (!resolvedUrl) {
			throw new Error("Unable to resolved URL");
		}
		const documentService = await this.documentServiceFactory.createDocumentService(
			resolvedUrl,
		);
		const storage = await documentService.connectToStorage();

		// External API uses null
		// eslint-disable-next-line unicorn/no-null
		const versions = await storage.getVersions(null, options?.maxCount ?? MAX_VERSION_COUNT);

		return versions.map((item) => {
			return { id: item.id, date: item.date };
		});
	}

	/**
	 * Creates an object with container services.
	 *
	 * @param container - The container for which to create services.
	 * @returns An object containing various services for the provided container.
	 */
	private getContainerServices(container: IContainer): AzureContainerServices {
		return {
			audience: new AzureAudience(container),
		};
	}

	/**
	 * Creates a Fluid Loader for the given container schema.
	 *
	 * @param containerSchema - The schema for which to create a Loader.
	 * @returns The Fluid Loader instance.
	 */
	private createLoader(containerSchema: ContainerSchema): Loader {
		const runtimeFactory = new DOProviderContainerRuntimeFactory(containerSchema);
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
			logger: this.props.logger,
			options: { client },
			configProvider: this.configProvider,
		});
	}

	/**
	 * Creates a FluidContainer object for a given Fluid container and connection configuration.
	 *
	 * @param container - The Fluid container.
	 * @param connection - The Azure connection configuration.
	 * @returns A FluidContainer object.
	 * @throws Will throw an error if the container is not in a detached state.
	 * @throws Will throw an error if the resolved URL is not available on the attached container.
	 */
	private async createFluidContainer(
		container: IContainer,
		connection: AzureConnectionConfig,
	): Promise<FluidContainer> {
		const createNewRequest = createAzureCreateNewRequest(
			connection.endpoint,
			getTenantId(connection),
		);

		const rootDataObject = await requestFluidObject<IRootDataObject>(container, "/");

		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (): Promise<string> => {
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state");
			}
			await container.attach(createNewRequest);
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			return container.resolvedUrl.id;
		};
		const fluidContainer = new FluidContainer(container, rootDataObject);
		fluidContainer.attach = attach;
		return fluidContainer;
	}
	// #endregion
}
