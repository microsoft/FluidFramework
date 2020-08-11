import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { DiceRoller } from "./component";

export { DiceRoller };

/**
 * fluidExport is the entry point of the fluid package. We define our component
 * as a component that can be created in the container.
 */
export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRoller.factory.type,
    // Add another component here to create it within the container
    [DiceRoller.factory],
);
