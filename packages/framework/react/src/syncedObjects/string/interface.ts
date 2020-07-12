/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@fluidframework/sequence";
import { IFluidReactState } from "../..";

export interface ISyncedStringState extends IFluidReactState {
    value?: SharedString;
}
