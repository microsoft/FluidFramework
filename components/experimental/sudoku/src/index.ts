/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { FluidSudoku, FluidSudokuName } from "./fluidSudoku";
import { ISudokuViewProps, SudokuView } from "./react/sudokuView";

/**
 * This does setup for the Container. The ContainerRuntimeFactoryWithDefaultComponent also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    FluidSudokuName,
    new Map([[FluidSudokuName, Promise.resolve(FluidSudoku.getFactory())]])
);

export { ISudokuViewProps, FluidSudoku, FluidSudokuName, SudokuView };
