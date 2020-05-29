/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@fluidframework/protocol-definitions";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentLastEditedTracker>> { }
}

export const IComponentLastEditedTracker: keyof IProvideComponentLastEditedTracker = "IComponentLastEditedTracker";

export interface IProvideComponentLastEditedTracker {
    readonly IComponentLastEditedTracker: IComponentLastEditedTracker;
}

export interface IComponentLastEditedTracker extends IProvideComponentLastEditedTracker {
    /**
     * Returns the details of the last edit to the container.
     */
    getLastEditDetails(): ILastEditDetails | undefined;

    /**
     * Updates the details of last edit to the container.
     */
    updateLastEditDetails(lastEditDetails: ILastEditDetails): void;
}

export interface ILastEditDetails {
    user: IUser;
    timestamp: number;
}
