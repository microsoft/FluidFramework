/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Fluid } from "./FluidStatic";

export * from "./containerCode";
export {
    FluidContainer,
    FluidInstance,
} from "./FluidStatic";

export type {
    ContainerConfig,
} from "./types";

// eslint-disable-next-line import/no-default-export
export default Fluid;
