/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IQuorum } from "@fluidframework/protocol-definitions";
import { IOldestClientObserver } from "./interfaces";

export interface IOldestClientObservableEvents extends IEvent {
    (event: "connected", listener: () => void);
    // Typescript won't convert IFluidDataStoreRuntime and ContainerRuntime if we unify these,
    // I believe this is because the "connected" event has a clientId arg in the runtimes.
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    (event: "disconnected", listener: () => void);
}

/**
 * This is to make OldestClientObserver work with either a ContainerRuntime or an IFluidDataStoreRuntime
 * (both expose the relevant API surface and eventing).  However, really this info probably shouldn't live on either,
 * since neither is really the source of truth (they are just the only currently-available plumbing options).
 * It's information about the connection, so the real source of truth is lower (at the connection layer).
 */
export interface IOldestClientObservable extends IEventProvider<IOldestClientObservableEvents> {
    getQuorum(): IQuorum;
    // Generic usage of attachState is a little unusual here.  We will treat ourselves as "the oldest client that
    // has information about this [container | data store]", which in the case of detached data store may disagree
    // with whether we're the oldest client on the connected container.  So in the data store case, it's only
    // safe use this as an indicator about rights to tasks performed against this specific data store, and not
    // more broadly.
    attachState: AttachState;
    connected: boolean;
    clientId: string | undefined;
}

/**
 * The `OldestClientObserver` is a utility inspect if the local client is the oldest amongst connected clients (in
 * terms of when they connected) and watch for changes.
 *
 * It is still experimental and under development.  Please do try it out, but expect breaking changes in the future.
 *
 * @remarks
 * ### Creation
 *
 * The `OldestClientObserver` constructor takes an `IOldestClientObservable`.  This is most easily satisfied with
 * either an `IContainerRuntime` or an `IFluidDataStoreRuntime`:
 *
 * ```typescript
 * // E.g. from within a BaseContainerRuntimeFactory:
 * protected async containerHasInitialized(runtime: IContainerRuntime) {
 *     const oldestClientObserver = new OldestClientObserver(runtime);
 *     // ...
 * }
 * ```
 *
 * ```typescript
 * // From within a DataObject
 * protected async hasInitialized() {
 *     const oldestClientObserver = new OldestClientObserver(this.runtime);
 *     // ...
 * }
 * ```
 *
 * ### Usage
 *
 * To check if the local client is the oldest, use the `isOldest()` method.
 *
 * ```typescript
 * if (oldestClientObserver.isOldest()) {
 *     console.log("I'm the oldest");
 * } else {
 *     console.log("Someone else is older");
 * }
 * ```
 *
 * ### Eventing
 *
 * `OldestClientObserver` is an `EventEmitter`, and will emit events when the local client becomes the oldest and when
 * it is no longer the oldest.
 *
 * ```typescript
 * oldestClientObserver.on("becameOldest", () => {
 *     console.log("I'm the oldest now");
 * });
 *
 * oldestClientObserver.on("lostOldest", () => {
 *     console.log("I'm not the oldest anymore");
 * });
 * ```
 */
export class OldestClientObserver extends TypedEventEmitter<IOldestClientObservableEvents>
    implements IOldestClientObserver {
    private readonly quorum: IQuorum;
    private currentIsOldest: boolean = false;
    constructor(private readonly observable: IOldestClientObservable) {
        super();
        this.quorum = this.observable.getQuorum();
        this.currentIsOldest = this.computeIsOldest();
        this.quorum.on("addMember", this.updateOldest);
        this.quorum.on("removeMember", this.updateOldest);
        observable.on("connected", this.updateOldest);
        observable.on("disconnected", this.updateOldest);
    }

    public isOldest(): boolean {
        return this.currentIsOldest;
    }

    private readonly updateOldest = () => {
        const oldest = this.computeIsOldest();
        if (this.currentIsOldest !== oldest) {
            this.currentIsOldest = oldest;
            if (oldest) {
                this.emit("becameOldest");
            } else {
                this.emit("lostOldest");
            }
        }
    };

    private computeIsOldest(): boolean {
        // If the container is detached, we are the only ones that know about it and are the oldest by default.
        if (this.observable.attachState === AttachState.Detached) {
            return true;
        }

        // If we're not connected we can't be the oldest connected client.
        if (!this.observable.connected) {
            return false;
        }

        assert(this.observable.clientId !== undefined, 0x1da /* "Client id should be set if connected" */);

        const selfSequencedClient = this.quorum.getMember(this.observable.clientId);
        // When in readonly mode our clientId will not be present in the quorum.
        if (selfSequencedClient === undefined) {
            return false;
        }

        const members = this.quorum.getMembers();
        for (const sequencedClient of members.values()) {
            if (sequencedClient.sequenceNumber < selfSequencedClient.sequenceNumber) {
                return false;
            }
        }

        // No member of the quorum was older
        return true;
    }
}
