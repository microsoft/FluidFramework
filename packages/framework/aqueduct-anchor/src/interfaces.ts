/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@microsoft/fluid-protocol-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideLastEdited>> { }
}

export interface IProvideLastEdited {
    readonly ILastEdited: ILastEdited;
}

export interface ILastEdited extends IProvideLastEdited {
    /**
     * Returns the details of the last edit to the container.
     */
    getLastEditDetails(): ILastEditDetails | undefined;
}

export interface ILastEditDetails {
    user: IUser;
    timestamp: number;
}
