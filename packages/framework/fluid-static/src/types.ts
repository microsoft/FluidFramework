/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

export type LoadableObjectRecord = Record<string, IFluidLoadable>;

export type LoadableObjectClassRecord = Record<string, LoadableObjectClass<any>>;

/**
 * A LoadableObjectClass is an class object of DataObject or SharedObject
 */
export type LoadableObjectClass<T extends IFluidLoadable> = DataObjectClass<T> | SharedObjectClass<T>;

/**
 * A DataObjectClass is a class that has a factory that can create a DataObject and a
 * constructor that will return the type of the DataObject.
 */
export type DataObjectClass<T extends IFluidLoadable>
    = { readonly factory: IFluidDataStoreFactory }  & LoadableObjectCtor<T>;

/**
 * A SharedObjectClass is a class that has a factory that can create a DDS (SharedObject) and a
 * constructor that will return the type of the DataObject.
 */
export type SharedObjectClass<T extends IFluidLoadable>
    = { readonly getFactory: () => IChannelFactory } & LoadableObjectCtor<T>;

/**
 * An object with a constructor that will return an `IFluidLoadable`.
 */
export type LoadableObjectCtor<T extends IFluidLoadable> = new(...args: any[]) => T;

export interface ContainerSchema {
    /**
     * initialObjects defines loadable objects that will be created when the Container
     * is first created. It uses the key as the id and the value as the loadable object to create.
     *
     * In the example below two objects will be created when the Container is first
     * created. One with id "map1" that will return a `SharedMap` and the other with
     * id "pair1" that will return a `KeyValueDataObject`.
     *
     * ```
     * {
     *   map1: SharedMap,
     *   pair1: KeyValueDataObject,
     * }
     * ```
     */
    initialObjects: LoadableObjectClassRecord;

    /**
     * Dynamic objects are Loadable objects that can be created after the initial Container creation.
     *
     * Types defined in `initialObjects` will always be available and are not required to be provided here.
     *
     * For best practice it's recommended to define all the dynamic types you create even if they are
     * included via initialObjects.
     */
    dynamicObjectTypes?: LoadableObjectClass<any>[];
}

/**
 * Events that trigger when the roster of members in the Fluid session change.
 * Only changes that would be reflected in the returned map of IServiceAudience's getMembers method
 * will emit events.
 */
export interface IServiceAudienceEvents<M extends IMember> extends IEvent {
    (event: "membersChanged", listener: () => void): void;
    (event: "memberAdded" | "memberRemoved", listener: (clientId: string, member: M) => void): void;
}

/**
 * Base interface to be implemented to fetch each service's audience. The generic M allows consumers to further
 * extend the client object with service-specific details about the connecting client, such as device information,
 * environme
 */
export interface IServiceAudience<M extends IMember> extends IEventProvider<IServiceAudienceEvents<M>> {
    /**
     * Returns an map of all users currently in the Fluid session where key is the userId and the value is the
     * member object.  The implementation may choose to exclude certain connections from the returned map.
     * E.g. ServiceAudience excludes non-interactive connections to represent only the roster of live users.
     */
    getMembers(): Map<string, M>;

    /**
     * Returns the current active user on this client once they are connected. Otherwise, returns undefined.
     */
    getMyself(): M | undefined;
}

/**
 * Base interface for information for each connection made to the Fluid session, which will be
 * different even if it is by the same user, i.e. the connection's id will be uniquely generated for each time the user
 * connects This interface can be extended to provide additional information specific to each service.
 */
export interface IConnection {
    id: string;
    mode: "write" | "read";
}

/**
 * Base interface to be implemented to fetch each service's member. The user ID is unique for each individual
 * user that is connecting to the session. However, one user may have multiple connections from different tabs,
 * devices, etc. and the information for each is provided within the connections array. This interface can be
 * extended by each service to provide additional service-specific user metadata.
 */
export interface IMember {
    userId: string;
    connections: IConnection[];
}
