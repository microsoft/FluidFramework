/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, IUser } from "@microsoft/fluid-protocol-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
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
     * Updates the last edit details based on the information in the message. This should be called only in response
     * to a remote op because it uses a shared summary block as storage.
     */
    updateLastEditDetails(message: ISequencedDocumentMessage): void;
}

export interface ILastEditDetails {
    user: IUser;
    timestamp: number;
}
