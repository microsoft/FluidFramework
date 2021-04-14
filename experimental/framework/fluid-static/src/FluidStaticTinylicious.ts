import { ITinyliciousFileConfig, TinyliciousService } from "@fluid-experimental/get-container";
import { FluidInstance } from "./FluidStatic";
import { ContainerConfig, FluidContainer } from ".";

/**
 * Singular global instance that lets the developer define the Fluid server across all instances of Containers.
 */
let globalFluidTinylicious: FluidInstance | undefined;
export const FluidTinylicious = {
    init() {
        if (globalFluidTinylicious) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        globalFluidTinylicious = new FluidInstance(new TinyliciousService());
    },
    async createContainer(
        fileConfig: ITinyliciousFileConfig,
        containerConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        if (!globalFluidTinylicious) {
            throw new Error(
                "Fluid has not been properly initialized before attempting to create a container",
            );
        }
        return globalFluidTinylicious.createContainer(fileConfig, containerConfig);
    },
    async getContainer(fileConfig: ITinyliciousFileConfig, containerConfig: ContainerConfig): Promise<FluidContainer> {
        if (!globalFluidTinylicious) {
            throw new Error(
                "Fluid has not been properly initialized before attempting to get a container",
            );
        }
        return globalFluidTinylicious.getContainer(fileConfig, containerConfig);
    },
};
