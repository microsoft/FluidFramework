/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Loader } from "@fluidframework/container-loader";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import {
    AttachState,
    IContainer,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import {
    ContainerSchema,
    DOProviderContainerRuntimeFactory,
    FluidContainer,
    IFluidContainer,
    RootDataObject,
} from "@fluidframework/fluid-static";

import { SummaryType } from "@fluidframework/protocol-definitions";

import {
    AzureClientProps,
    AzureConnectionConfig,
    AzureContainerServices,
    AzureContainerVersion,
    AzureGetVersionsOptions,
} from "./interfaces";
import { isAzureRemoteConnectionConfig } from "./utils";
import { AzureAudience } from "./AzureAudience";
import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver";

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
 * when running with local tenantId, have it be backed by a local Azure Fluid Relay instance.
 */
export class AzureClient {
    private readonly documentServiceFactory: IDocumentServiceFactory;
    private readonly urlResolver: IUrlResolver;

    /**
     * Creates a new client instance using configuration parameters.
     * @param props - Properties for initializing a new AzureClient instance
     */
    constructor(private readonly props: AzureClientProps) {
        // remove trailing slash from URL if any
        props.connection.endpoint = props.connection.endpoint.replace(/\/$/, "");
        this.urlResolver = new AzureUrlResolver();
        // The local service implementation differs from the Azure Fluid Relay in blob
        // storage format. Azure Fluid Relay supports whole summary upload. Local currently does not.
        const isRemoteConnection = isAzureRemoteConnectionConfig(this.props.connection);
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            this.props.connection.tokenProvider,
            { enableWholeSummaryUpload: isRemoteConnection, enableDiscovery: isRemoteConnection },
        );
    }

    /**
     * Creates a new detached container instance in the Azure Fluid Relay.
     * @param containerSchema - Container schema for the new container.
     * @returns New detached container instance along with associated services.
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
     * @param id - Unique ID of the source container in Azure Fluid Relay.
     * @param containerSchema - Container schema used to access data objects in the container.
     * @param version - Unique version of the source container in Azure Fluid Relay.
     * It defaults to latest version if parameter not provided.
     * @returns New detached container instance along with associated services.
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
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer = new FluidContainer(container, rootDataObject);
        const services = this.getContainerServices(container);
        return { container: fluidContainer, services };
    }

    /**
     * Get the list of versions for specific container.
     * @param id - Unique ID of the source container in Azure Fluid Relay.
     * @param options - "Get" options. If options are not provided, API
     * will assume maxCount of versions to retreive to be 5.
     * @returns Array of available container versions.
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

    private getContainerServices(container: IContainer): AzureContainerServices {
        return {
            audience: new AzureAudience(container),
        };
    }

    private createLoader(containerSchema: ContainerSchema): Loader {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(containerSchema);
        const load = async (): Promise<IFluidModuleWithDetails> => {
            return {
                module: { fluidExport: runtimeFactory },
                details: { package: "no-dynamic-package", config: {} },
            };
        };

        const codeLoader = { load };
        return new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: this.props.logger,
        });
    }

    private async createFluidContainer(
        container: IContainer,
        connection: AzureConnectionConfig,
    ): Promise<FluidContainer> {
        const createNewRequest = createAzureCreateNewRequest(
            connection.endpoint,
            getTenantId(connection),
        );

        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        return new (class extends FluidContainer {
            /**
             * See {@link FluidContainer.attach}
             *
             * @remarks This is required since the FluidContainer doesn't have knowledge of how the attach will happen
             * or the id that will be returned.
             * This exists because we are projecting a separation of server responsibility to the end developer that
             * doesn't exist in the framework.
             */
            public async attach(): Promise<string> {
                if (this.attachState !== AttachState.Detached) {
                    throw new Error("Cannot attach container. Container is not in detached state");
                }
                await container.attach(createNewRequest);
                const resolved = container.resolvedUrl;
                ensureFluidResolvedUrl(resolved);
                return resolved.id;
            }
        })(container, rootDataObject);
    }
    // #endregion
}
