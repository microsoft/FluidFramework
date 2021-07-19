/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IErrorEvent } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

// TODO:
// add way to mark with current sequence number for ordering signals relative to ops
// throttling and batching

export type SignalListener = (clientId: string, local: boolean, payload: Jsonable) => void;

/**
 * ISignalManager defines an interface for working with signals that is similar to the more common
 * eventing patterns of EventEmitter.  In addition to sending and responding to signals, it
 * provides explicit methods around signal requests to other connected clients.
 */
export interface ISignalManager {
    /**
     * Adds a listener for the specified signal.  It behaves in the same way as EventEmitter's `on`
     * method regarding multiple registrations, callback order, etc.
     * @param signalName - The name of the signal
     * @param listener - The callback signal handler to add
     * @returns This ISignalManager
     */
    onSignal(signalName: string, listener: SignalListener): ISignalManager;
     /**
     * Remove a listener for the specified signal.  It behaves in the same way as EventEmitter's
     * `off` method regarding multiple registrations, removal order, etc.
     * @param signalName - The name of the signal
     * @param listener - The callback signal handler to remove
     * @returns This ISignalManager
     */
    offSignal(signalName: string, listener: SignalListener | ((message: any) => void)): ISignalManager;
    /**
     * Send a signal with payload to its connected listeners.
     * @param signalName - The name of the signal
     * @param payload - The data to send with the signal
     */
    submitSignal(signalName: string, payload?: Jsonable);

    /**
     * Adds a listener for a broadcast request.  The listener is called when a client calls
     * `requestBroadcast` for that signal.  It behaves in the same way as EventEmitter's `on`
     * method regarding multiple registrations, callback order, etc.
     * @param signalName - The signal for which broadcast is requested
     * @param listener - The callback for the broadcast request to add
     * @returns This ISignalManager
     */
    onBroadcastRequested(signalName: string, listener: SignalListener): ISignalManager;
    /**
     * Remove a listener for a broadcast request.  It behaves in the same way as EventEmitter's
     * `off` method regarding multiple registrations, removal order, etc.
     * @param signalName  - The signal for which broadcast is requested
     * @param listener - The callback for the broadcast request to remove
     * @returns This ISignalManager
     */
    offBroadcastRequested(signalName: string, listener: SignalListener): ISignalManager;
    /**
     * Request broadcast of a signal from other connected clients.  Other clients must have
     * registered to respond to broadcast requests using the `onBroadcastRequested` method.
     * @param signalName - The signal for which broadcast is requested
     * @param payload - A payload to send with the broadcast request
     */
    requestBroadcast(signalName: string, payload?: Jsonable);
}

/**
 * Duck type of something that provides the expected signalling functionality:
 * A way to verify we can signal, a way to send a signal, and a way to listen for incoming signals
 */
export interface ISignaler {
    connected: boolean;
    on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
    submitSignal(type: string, content: any): void;
}

/**
 * Note: currently experimental and under development
 *
 * Helper class to assist common scenarios around working with signals.  SignalManager wraps an
 * object with signaling functionality (e.g. ContainerRuntime or FluidDataStoreRuntime) and can
 * then be used in place of the original signaler.  It uses a separate internal EventEmitter to
 * manage callbacks, and thus will reflect that behavior with regards to callback registration and
 * deregistration.
 */
export class SignalManager extends TypedEventEmitter<IErrorEvent> implements ISignalManager {
    private readonly emitter  = new EventEmitter();

    private readonly managerId: string | undefined;

    constructor(
        /**
         * Object to wrap that can submit and listen to signals
         */
        private readonly signaler: ISignaler,
        /**
         * Optional id to assign to this manager that will be attached to
         * signal names.  Useful to avoid collisions if there are multiple
         * signal users at the Container level
         */
        managerId?: string,
    ) {
        super();
        this.emitter.on("error", (error) => {
            this.emit("error", error);
        });
        this.managerId = managerId ? `#${managerId}` : undefined;
        this.signaler.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            const clientId = message.clientId;
            // Only call listeners when the runtime is connected and if the signal has an
            // identifiable sender clientId.  The listener is responsible for deciding how
            // it wants to handle local/remote signals
            // eslint-disable-next-line no-null/no-null
            if (this.signaler.connected && clientId !== null) {
                this.emitter.emit(message.type, clientId, local, message.content);
            }
        });
    }

    private getManagerSignalName(signalName: string): string {
        return this.managerId ? `${signalName}${this.managerId}` : signalName;
    }

    private getBroadcastSignalName(signalName: string): string {
        return `${signalName}#req`;
    }

    // ISignalManager methods

    public onSignal(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        const managerSignalName = this.getManagerSignalName(signalName);
        this.emitter.on(managerSignalName, listener);
        return this;
    }

    public offSignal(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        const managerSignalName = this.getManagerSignalName(signalName);
        this.emitter.off(managerSignalName, listener);
        return this;
    }

    public submitSignal(
        signalName: string,
        payload?: Jsonable,
    ) {
        const managerSignalName = this.getManagerSignalName(signalName);
        if (this.signaler.connected) {
            this.signaler.submitSignal(managerSignalName, payload);
        }
    }

    public onBroadcastRequested(
        signalName: string,
        listener: SignalListener,
    ) {
        const broadcastSignalName = this.getBroadcastSignalName(signalName);
        return this.onSignal(broadcastSignalName, listener);
    }

    public offBroadcastRequested(
        signalName: string,
        listener: SignalListener,
    ) {
        const broadcastSignalName = this.getBroadcastSignalName(signalName);
        return this.offSignal(broadcastSignalName, listener);
    }

    public requestBroadcast(
        signalName: string,
        payload?: Jsonable,
    ) {
        const broadcastSignalName = this.getBroadcastSignalName(signalName);
        this.submitSignal(broadcastSignalName, payload);
    }
}

/**
 * Note: currently experiemental and under development
 *
 * DataObject implementation of SignalManager for fluid-static plug-and-play.  Allows fluid-static
 * users to get an ISignalManager without a custom DO.  Where possible, consumers should instead
 * create a SignalManager themselves instead of using the DO wrapper to avoid the DO overhead.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export class SignalManagerDO extends DataObject<{}, undefined, IErrorEvent> implements EventEmitter, ISignalManager {
    private _manager: SignalManager | undefined;
    private get manager(): SignalManager {
        assert(this._manager !== undefined, "internal mangager should be defined");
        return this._manager;
    }

    public static get Name() { return "@fluid-example/signal-manager-do"; }

    public static readonly factory = new DataObjectFactory<SignalManagerDO, undefined, undefined, IErrorEvent>
    (
        SignalManagerDO.Name,
        SignalManagerDO,
        [],
        {},
    );

    protected async hasInitialized() {
        this._manager = new SignalManager(this.runtime);
        this.manager.on("error", (error) => {
            this.emit("error", error);
        });
    }

    // ISignalManager methods  Note these are all passthroughs

    public onSignal(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        this.manager.onSignal(signalName, listener);
        return this;
    }

    public offSignal(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        this.manager.offSignal(signalName, listener);
        return this;
    }

    public submitSignal(
        signalName: string,
        payload?: Jsonable,
    ) {
        this.manager.submitSignal(signalName, payload);
    }

    public onBroadcastRequested(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        this.manager.onBroadcastRequested(signalName, listener);
        return this;
    }

    public offBroadcastRequested(
        signalName: string,
        listener: SignalListener,
    ): ISignalManager {
        this.manager.offBroadcastRequested(signalName, listener);
        return this;
    }

    public requestBroadcast(
        signalName: string,
        payload?: Jsonable,
    ) {
        this.manager.requestBroadcast(signalName, payload);
    }
}
