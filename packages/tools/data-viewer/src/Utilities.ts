import { IContainer } from "@fluidframework/container-definitions";
import { IFluidContainer } from "@fluidframework/fluid-static";

/**
 * Some common utilities used by the components.
 */

/**
 * Gets the inner IContainer from within the IFluidContainer via some hackery.
 */
export function getInnerContainer(container: IFluidContainer): IContainer {
    // Hack to get at container internals
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const innerContainer = (container as any).container as IContainer;
    if (innerContainer === undefined) {
        throw new Error("Could not find inner IContainer under IFluidContainer.");
    }
    return innerContainer;
}
