/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializedHandle } from "@microsoft/fluid-component-core-interfaces";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";

export function raiseConnectedEvent(emitter: EventEmitter, state: ConnectionState, clientId: string) {
    if (state === ConnectionState.Connected) {
        emitter.emit("connected", clientId);
    } else if (state === ConnectionState.Connecting) {
        emitter.emit("joining");
    } else {
        emitter.emit("disconnected");
    }
}

export function isSerializedHandle(value: any): value is ISerializedHandle {
    // tslint:disable-next-line:no-unsafe-any
    return value && value.type === "__fluid_handle__";
}

/**
 * Utility that makes sure that an expensive function fn
 * only has a single running instance at a time. For example,
 * this can ensure that only a single web request is pending at a
 * given time.
 */
export class SinglePromise<T> {
    private pResponse: Promise<T> | undefined;
    private active: boolean;
    constructor(private readonly fn: () => Promise<T>) {
        this.active = false;
    }

    public get response(): Promise<T> {
        // if we are actively running and we have a response return it
        if (this.active && this.pResponse) {
            return this.pResponse;
        }

        this.active = true;
        this.pResponse = this.fn()
            .then((response) => {
                this.active = false;
                return response;
            })
            .catch(async (e) => {
                this.active = false;
                return Promise.reject(e);
            });

        return this.pResponse;
    }
}
