/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidProps,
    IFluidReactState,
} from "./interface";
import { FluidReactComponent } from "./reactComponent";

/**
 * A simple React component where there the Fluid state and view state are the same
 * i.e. There are no DDS/SharedObjects being used and no cross-component relationships
 */
export abstract class SimpleReactComponent<S extends IFluidReactState> extends FluidReactComponent<S, S> {
    constructor(props: IFluidProps<S, S>) {
        super(props);
    }
}
