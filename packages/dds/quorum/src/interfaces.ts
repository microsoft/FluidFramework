/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface IQuorumEvents extends ISharedObjectEvents {
    /**
     * Notifies when a new value has been accepted.
     */
    (event: "accept", listener: (key: string) => void);
}

/**
 * Task manager interface
 */

export interface IQuorum extends ISharedObject<IQuorumEvents> {
    has(key: string): boolean;
    get(key: string): any;
    set(key: string, value: any): Promise<boolean>;
}
