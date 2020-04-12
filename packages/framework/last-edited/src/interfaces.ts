/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideLastEditedTracker>> { }
}

export interface IProvideLastEditedTracker {
    readonly IComponentLastEditedTracker: IComponentLastEditedTracker;
}

export interface IComponentLastEditedTracker extends IProvideLastEditedTracker {
    readonly lastEditedTracker: ILastEditedTracker;
}

export interface ILastEditedTracker extends EventEmitter {
    /**
     * Returns the details of the last edit to the container.
     */
    getLastEditDetails(): ILastEditDetails | undefined;

    /**
     * Updates the last edit details based on the information in the message. This should be called only in response
     * to a remote op because it uses summarizable object as storage.
     */
    updateLastEditDetails(message: ISequencedDocumentMessage): void;
}

export interface ILastEditDetails {
    clientId: string;
    timestamp: number;
}
