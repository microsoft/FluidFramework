/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Loader } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
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

import { AzureClientProps, AzureContainerServices } from "./interfaces";
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

        const rootDataObject = await requestFluidObject<RootDataObject>(
            container,
            "/",
        );
        const createNewRequest = createAzureCreateNewRequest(
            this.props.connection.orderer,
            this.props.connection.storage,
            this.props.connection.tenantId,
        );
        const fluidContainer = new (class extends FluidContainer {
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

    private getContainerServices(container: IContainer): AzureContainerServices {
        return {
            audience: new AzureAudience(container),
        };
    }

    private createLoader(containerSchema: ContainerSchema): Loader {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
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
}
