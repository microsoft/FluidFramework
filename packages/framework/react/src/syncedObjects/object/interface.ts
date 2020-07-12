/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidReactState } from "../..";

export interface ISyncedMapState<T> extends IFluidReactState {
    value: T;
}
