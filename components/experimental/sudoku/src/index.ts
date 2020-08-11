/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { FluidSudoku } from "./fluidSudoku";
import { ISudokuViewProps, SudokuView } from "./react/sudokuView";

/**
 * This does setup for the Container. The ContainerRuntimeFactoryWithDefaultDataStore also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    FluidSudoku.getFactory().type,
    [FluidSudoku.getFactory()]
);

export { ISudokuViewProps, FluidSudoku, SudokuView };
