/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Loader } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { AttachState, IContainer } from "@fluidframework/container-definitions";
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

import {
    SummaryType,
} from "@fluidframework/protocol-definitions";

import {
    AzureClientProps,
    AzureConnectionConfig,
    AzureContainerServices,
    AzureContainerVersion,
} from "./interfaces";
import { AzureAudience } from "./AzureAudience";
import {
    AzureUrlResolver,
    createAzureCreateNewRequest,
} from "./AzureUrlResolver";

/**
 * Strongly typed id for connecting to a local Azure Fluid Relay.
 */
export const LOCAL_MODE_TENANT_ID = "local";

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
        this.urlResolver = new AzureUrlResolver();
        // The local service implementation differs from the Azure Fluid Relay in blob
        // storage format. Azure Fluid Relay supports whole summary upload. Local currently does not.
        const enableWholeSummaryUpload =
            this.props.connection.tenantId !== LOCAL_MODE_TENANT_ID;
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            this.props.connection.tokenProvider,
            { enableWholeSummaryUpload },
        );
    }

    /**
     * Creates a new detached container instance in the Azure Fluid Relay.
     * @param containerSchema - Container schema for the new container.
     * @returns New detached container instance along with associated services.
     */
    public async createContainer(
        containerSchema: ContainerSchema,
    ): Promise<{
        container: IFluidContainer;
        services: AzureContainerServices;
    }> {
        const loader = this.createLoader(containerSchema);

        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });

        const fluidContainer = await this.createFluidContainer(
            container,
            this.props.connection,
        );
        const services = this.getContainerServices(container);
        return { container: fluidContainer, services };
    }

    /**
     * Recreates new container out of specific version of another container
     * @param id - Unique ID of the source container in Azure Fluid Relay.
     * @param version - Unique version of the source container in Azure Fluid Relay.
     * @param containerSchema - Container schema used to access data objects in the container.
     * @returns New container instance along with associated services.
     */
    public async reCreateContainer(
        id: string,
        version: string,
        containerSchema: ContainerSchema,
    ): Promise<{
        container: IFluidContainer;
        services: AzureContainerServices;
    }> {
        const loader = this.createLoader(containerSchema);
        const url = new URL(this.props.connection.orderer);
        url.searchParams.append("storage", encodeURIComponent(this.props.connection.storage));
        url.searchParams.append("tenantId", encodeURIComponent(this.props.connection.tenantId));
        url.searchParams.append("containerId", encodeURIComponent(id));
        const sourceContainer = await loader.resolve({ url: url.href });

        if(sourceContainer.resolvedUrl === undefined) {
            throw new Error(
                "Source container cannot resolve URL.",
            );
        }

        const documentService = await this.documentServiceFactory.createDocumentService(sourceContainer.resolvedUrl);
        const storage = await documentService.connectToStorage();
        const handle = {
            type: SummaryType.Handle,
            handleType: SummaryType.Tree,
            handle: version,
        };
        const tree = await storage.downloadSummary(handle);

        // getSanitizedSummary is coming through PR: #9650. We will use then sanitized tree for rehydration,
        // const sanitizedTree = getSanitizedSummary(tree);
        const container = await loader.rehydrateDetachedContainerFromSnapshot(
            JSON.stringify(tree),
        );

        const fluidContainer = await this.createFluidContainer(
            container,
            this.props.connection,
        );
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
        const url = new URL(this.props.connection.orderer);
        url.searchParams.append("storage", encodeURIComponent(this.props.connection.storage));
        url.searchParams.append("tenantId", encodeURIComponent(this.props.connection.tenantId));
        url.searchParams.append("containerId", encodeURIComponent(id));
        const container = await loader.resolve({ url: url.href });
        const rootDataObject = await requestFluidObject<RootDataObject>(
            container,
            "/",
        );
        const fluidContainer = new FluidContainer(container, rootDataObject);
        const services = this.getContainerServices(container);
        return { container: fluidContainer, services };
    }

    /**
     * Get the list of versions for specific container
     * @param id - Unique ID of the source container in Azure Fluid Relay.
     * @param maxCount - Max number of versions to retreive,
     * @returns Array of available versions
     */
     public async getContainerVersions(
        id: string,
        maxCount: number,
    ): Promise<AzureContainerVersion[]> {
        const url = new URL(this.props.connection.orderer);
        url.searchParams.append(
            "storage",
            encodeURIComponent(this.props.connection.storage),
        );
        url.searchParams.append(
            "tenantId",
            encodeURIComponent(this.props.connection.tenantId),
        );
        url.searchParams.append("containerId", encodeURIComponent(id));

        const resolvedUrl = await this.urlResolver.resolve({ url: url.href });
        if (!resolvedUrl) {
            throw new Error("Unable to resolved URL");
        }
        const documentService =
            await this.documentServiceFactory.createDocumentService(
                resolvedUrl,
            );
        const storage = await documentService.connectToStorage();
        const versions = await storage.getVersions(null, maxCount);

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
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const module = { fluidExport: runtimeFactory };
        const codeLoader = { load: async () => module };
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
            connection.orderer,
            connection.storage,
            connection.tenantId,
        );

        const rootDataObject = await requestFluidObject<RootDataObject>(
            container,
            "/",
        );
        return new (class extends FluidContainer {
            async attach() {
                if (this.attachState !== AttachState.Detached) {
                    throw new Error(
                        "Cannot attach container. Container is not in detached state",
                    );
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
