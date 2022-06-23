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
import {
    createTinyliciousCreateNewRequest,
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
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
    TinyliciousClientProps,
    TinyliciousContainerServices,
} from "./interfaces";
import { TinyliciousAudience } from "./TinyliciousAudience";

/**
 * Provides the ability to have a Fluid object backed by a Tinylicious service.
 *
 * @see {@link https://fluidframework.com/docs/testing/tinylicious/}
 */
export class TinyliciousClient {
    private readonly documentServiceFactory: IDocumentServiceFactory;
    private readonly urlResolver: IUrlResolver;

    /**
     * Creates a new client instance using configuration parameters.
     * @param props - Optional. Properties for initializing a new TinyliciousClient instance
     */
    constructor(private readonly props?: TinyliciousClientProps) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(
            this.props?.connection?.port,
            this.props?.connection?.domain,
        );
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    /**
     * Creates a new detached container instance in Tinylicious server.
     * @param containerSchema - Container schema for the new container.
     * @returns New detached container instance along with associated services.
     */
    public async createContainer(
        containerSchema: ContainerSchema,
    ): Promise<{ container: IFluidContainer; services: TinyliciousContainerServices; }> {
        const loader = this.createLoader(containerSchema);

        // We're not actually using the code proposal (our code loader always loads the same module
        // regardless of the proposal), but the Container will only give us a NullRuntime if there's
        // no proposal.  So we'll use a fake proposal.
        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });

        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");

        const fluidContainer = new (class extends FluidContainer {
            async attach() {
                if (this.attachState !== AttachState.Detached) {
                    throw new Error("Cannot attach container. Container is not in detached state");
                }
                const request = createTinyliciousCreateNewRequest();
                await container.attach(request);
                const resolved = container.resolvedUrl;
                ensureFluidResolvedUrl(resolved);
                return resolved.id;
            }
        })(container, rootDataObject);

        const services = this.getContainerServices(container);
        return { container: fluidContainer, services };
    }

    /**
     * Accesses the existing container given its unique ID in the tinylicious server.
     * @param id - Unique ID of the container.
     * @param containerSchema - Container schema used to access data objects in the container.
     * @returns Existing container instance along with associated services.
     */
    public async getContainer(
        id: string,
        containerSchema: ContainerSchema,
    ): Promise<{ container: IFluidContainer; services: TinyliciousContainerServices; }> {
        const loader = this.createLoader(containerSchema);
        const container = await loader.resolve({ url: id });
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer = new FluidContainer(container, rootDataObject);
        const services = this.getContainerServices(container);
        return { container: fluidContainer, services };
    }

    // #region private
    private getContainerServices(
        container: IContainer,
    ): TinyliciousContainerServices {
        return {
            audience: new TinyliciousAudience(container),
        };
    }

    private createLoader(containerSchema: ContainerSchema) {
        const containerRuntimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const load = async (): Promise<IFluidModuleWithDetails> => {
            return {
                module: { fluidExport: containerRuntimeFactory },
                details: { package: "no-dynamic-package", config: {} },
            };
        };

        const codeLoader = { load };
        const loader = new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: this.props?.logger,
        });
        return loader;
    }
    // #endregion
}
