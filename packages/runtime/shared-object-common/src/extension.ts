/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChaincodeModule } from "@prague/runtime-definitions";

/**
 * Definitions of a shared factories. Factories follow a common model but enable custom behavior.
 */
export interface ISharedObjectFactory extends IChaincodeModule {
    /**
     * String representing the type of the factory.
     */
    type: string;

    /**
     * String representing the version of the snapshot. This value is updated when the format of snapshots changes.
     */
    readonly snapshotFormatVersion: string;
}
