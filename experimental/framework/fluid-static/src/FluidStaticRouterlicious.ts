import {
    IRouterliciousConfig,
    ITinyliciousFileConfig,
    RouterliciousService,
} from "@fluid-experimental/get-container";
import { Container } from "@fluidframework/container-loader";
import {
    DOProviderContainerRuntimeFactory,
    FluidContainer,
} from "./containerCode";
import { ContainerConfig } from "./types";

/**
 * FluidRouterliciousInstance provides the ability to have a Fluid object backed by a Routerlicious service
 */
export class FluidRouterliciousInstance {
    private readonly containerService: RouterliciousService;

    public constructor(config: IRouterliciousConfig) {
        this.containerService = new RouterliciousService(config);
    }

    public async createContainer(
        fileConfig: ITinyliciousFileConfig,
        containerConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerConfig,
        );
        const container = await this.containerService.createContainer(
            fileConfig,
            runtimeFactory,
        );
        return this.getRootDataObject(container);
    }

    public async getContainer(
        fileConfig: ITinyliciousFileConfig,
        containerConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerConfig,
        );
        const container = await this.containerService.getContainer(
            fileConfig,
            runtimeFactory,
        );
        return this.getRootDataObject(container);
    }

    private async getRootDataObject(
        container: Container,
    ): Promise<FluidContainer> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as FluidContainer;
    }
}

/**
 * Singular global instance that lets the developer define all Container interactions with the Routerlicious service
 */
let globalFluidRouterlicious: FluidRouterliciousInstance | undefined;
export const FluidRouterlicious = {
    init(config: IRouterliciousConfig) {
        if (globalFluidRouterlicious) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        globalFluidRouterlicious = new FluidRouterliciousInstance(config);
    },
    async createContainer(
        fileConfig: ITinyliciousFileConfig,
        containerConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        if (!globalFluidRouterlicious) {
            throw new Error(
                "Fluid has not been properly initialized before attempting to create a container",
            );
        }
        return globalFluidRouterlicious.createContainer(
            fileConfig,
            containerConfig,
        );
    },
    async getContainer(
        fileConfig: ITinyliciousFileConfig,
        containerConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        if (!globalFluidRouterlicious) {
            throw new Error(
                "Fluid has not been properly initialized before attempting to get a container",
            );
        }
        return globalFluidRouterlicious.getContainer(fileConfig, containerConfig);
    },
};
