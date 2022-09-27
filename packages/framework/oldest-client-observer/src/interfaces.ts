/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { IQuorumClients } from "@fluidframework/protocol-definitions";

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
    getQuorum(): IQuorumClients;
    // Generic usage of attachState is a little unusual here.  We will treat ourselves as "the oldest client that
    // has information about this [container | data store]", which in the case of detached data store may disagree
    // with whether we're the oldest client on the connected container.  So in the data store case, it's only
    // safe use this as an indicator about rights to tasks performed against this specific data store, and not
    // more broadly.
    attachState: AttachState;
    connected: boolean;
    clientId: string | undefined;
}

export interface IOldestClientObserverEvents extends IEvent {
    (event: "becameOldest" | "lostOldest", listener: () => void);
}

export interface IOldestClientObserver extends IEventProvider<IOldestClientObserverEvents> {
    isOldest(): boolean;
}
