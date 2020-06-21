/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidReactState } from "./interface";
import { FluidReactComponent } from "./reactComponent";

/**
 * A unified React component where there the Fluid state and view state are the same
 * i.e. There are no DDS/SharedObjects being used and no cross-component relationships
 */
export abstract class UnifiedFluidReactComponent<S extends IFluidReactState> extends FluidReactComponent<S, S> { }
