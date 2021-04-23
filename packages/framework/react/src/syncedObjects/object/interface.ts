/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidReactState } from "../..";

/**
 * The synced state definition that will fill the value parameter with the type T object that will be
 * defined in the synced state config
 */
export interface ISyncedMapState<T> extends IFluidReactState {
    value: T;
}
