/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@microsoft/fluid-protocol-definitions";

export interface ILastEditDetails {
    user: IUser;
    timestamp: number;
}

export interface IAqueductAnchor {
    /**
     * Returns the details of the last edit to the container.
     */
    getLastEditDetails(): ILastEditDetails | undefined;
}
