/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@fluidframework/sequence";
import { IFluidReactState } from "../..";

/**
 * The state definition for a synced string
 * TODO: Add a proper SharedString to string mapping but, for now, you can pass the pre-initialized SharedString
 * directly into the CollaborativeInput provided by the react-inputs package from within
 * the React functional view useSyncedString is called in
 */
export interface ISyncedStringState extends IFluidReactState {
    value?: SharedString;
}
