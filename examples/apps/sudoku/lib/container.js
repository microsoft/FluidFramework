/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { FluidSudoku } from "./fluidSudoku";
/**
 * This does setup for the Container. The ContainerRuntimeFactoryWithDefaultDataStore also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const SudokuContainer = new ContainerRuntimeFactoryWithDefaultDataStore(FluidSudoku.ObjectIdentifier, new Map([[FluidSudoku.ObjectIdentifier, Promise.resolve(FluidSudoku.getFactory())]]));
//# sourceMappingURL=container.js.map