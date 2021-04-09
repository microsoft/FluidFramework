import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { DiceRoller } from "./dataObject";

export { DiceRoller };

/**
 * fluidExport is the entry point of the fluid package. We define our DataObject
 * as a DataObject that can be created in the container.
 */
export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRoller.factory,
    new Map([
        DiceRoller.factory.registryEntry,
        // Add another data store here to create it within the container
    ]));
