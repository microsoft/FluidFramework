/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidReactState } from "./interface";
import { FluidReactComponent } from "./reactComponent";

/**
 * A PureFluidReactComponent is a FluidReactComponent where there the Fluid state and view state are the same
 * i.e. There are no DDS/SharedObjects being used and no cross-component relationships
 */
export abstract class PureFluidReactComponent<S extends IFluidReactState> extends FluidReactComponent<S, S> { }
