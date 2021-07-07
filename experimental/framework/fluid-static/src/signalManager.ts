/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IErrorEvent } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

// TODO:
// add way to mark with current sequence number for ordering signals relative to ops
// async listener support

export type SignalListener = (clientId: string, local: boolean, payload: Jsonable) => void;

export interface ISignalManager {
    /**
     * Adds a listener for the specified signal at the end of the listeners array.  Multiple calls
     * with the same signal name and listener will add it (and call it) multiple times.  Listeners
     * are called in the order they are added.
     * @param signalName - The name of the signal
     * @param listener - The callback signal handler
     * @returns This ISignalManager
     */
    registerListener(signalName: string, listener: SignalListener): ISignalManager;

    /**
     * Remove the last added instance of the listener for the specified signal in the listeners
     * array if present.  If a listener has been added multiple times, it must be removed that many
     * times as well to remove all instances.
     *
     * TODO: specify behavior around in-flight calls/mutability
     * @param signalName - The name of the signal
     * @param listener - The callback signal handler
     * @returns This ISignalManager
     */
    deregisterListener(signalName: string, listener: SignalListener): ISignalManager;

    submitSignal(signalName: string, payload?: Jsonable);

    registerBroadcastListener(signalName: string, listener: SignalListener): ISignalManager;

    deregisterBroadcastListener(signalName: string, listener: SignalListener): ISignalManager;

    requestBroadcast(signalName: string, payload?: Jsonable);
}

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export class SignalManager extends DataObject<{}, undefined, IErrorEvent> implements EventEmitter, ISignalManager {
    private static readonly managerIdKey = "managerId";

    private _managerId: number | undefined;
    private get managerId(): number {
        assert(this._managerId !== undefined, "managerId must be defined");
        return this._managerId;
    }

    /**
     * Local map of registered signal handlers
     * Map<signalName, handlerFunction[]>
     */
    private readonly listenerMap = new Map<string, SignalListener[]>();

    public static get Name() { return "@fluid-example/signal-manager"; }

    public static readonly factory = new DataObjectFactory<SignalManager, undefined, undefined, IErrorEvent>
    (
        SignalManager.Name,
        SignalManager,
        [],
        {},
    );

    protected async initializingFirstTime() {
        const signalManagerId = Math.floor(Math.random() * 10000);
        this.root.set(SignalManager.managerIdKey, signalManagerId);
    }

    protected async hasInitialized() {
        this._managerId = this.root.get(SignalManager.managerIdKey);

        this.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            const listeners = this.listenerMap.get(message.type);
            const clientId = message.clientId;
            // Only call listeners when the runtime is connected and if the signal has an
            // identifiable sender clientId.  The listener is responsible for deciding how
            // it wants to handle local/remote signals
            // eslint-disable-next-line no-null/no-null
            if (listeners !== undefined && this.runtime.connected && clientId !== null) {
                listeners.forEach((listener) => {
                    listener(clientId, local, message.content);
                });
            }
        });
    }

    private getManagerSignalName(signalName: string): string {
        return `${signalName}#${this.managerId}`;
    }

    private getBroadcastSignalName(signalName: string): string {
        return `${signalName}#req`;
    }

    // ISignalManager methods

    public registerListener(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        const managerSignalName = this.getManagerSignalName(signalName);
        let listenerList = this.listenerMap.get(managerSignalName);
        if (listenerList === undefined) {
            listenerList = [];
            this.listenerMap.set(signalName, listenerList);
        }
        listenerList.push(listener);
        return this;
    }

    public deregisterListener(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        const managerSignalName = this.getManagerSignalName(signalName);
        const listenerList = this.listenerMap.get(managerSignalName);
        if (listenerList !== undefined) {
            const index = listenerList.lastIndexOf(listener);
            if (index !== -1) {
                listenerList.splice(index, 1);
            }
        }
        return this;
    }

    public submitSignal(
        signalName: string,
        payload?: Jsonable,
    ) {
        const managerSignalName = this.getManagerSignalName(signalName);
        if (this.runtime.connected) {
            this.runtime.submitSignal(managerSignalName, payload);
        }
    }

    public registerBroadcastListener(
        signalName: string,
        listener: SignalListener,
    ) {
        const broadcastSignalName = this.getBroadcastSignalName(signalName);
        return this.registerListener(broadcastSignalName, listener);
    }

    public deregisterBroadcastListener(
        signalName: string,
        listener: SignalListener,
    ) {
        const broadcastSignalName = this.getBroadcastSignalName(signalName);
        return this.deregisterListener(broadcastSignalName, listener);
    }

    public requestBroadcast(
        signalName: string,
        payload?: Jsonable,
    ) {
        const broadcastSignalName = this.getBroadcastSignalName(signalName);
        this.submitSignal(broadcastSignalName, payload);
    }
}
