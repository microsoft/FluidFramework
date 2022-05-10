/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

/**
 * A mapping of string identifiers to instantiated DataObjects or SharedObjects.
 */
export type LoadableObjectRecord = Record<string, IFluidLoadable>;

/**
 * A mapping of string identifiers to classes that will later be used to instantiate a corresponding DataObject
 * or SharedObject in a LoadableObjectRecord.
 */
export type LoadableObjectClassRecord = Record<string, LoadableObjectClass<any>>;

/**
 * A LoadableObjectClass is an class object of DataObject or SharedObject
 * @typeParam T - The class of the DataObject or SharedObject
 */
export type LoadableObjectClass<T extends IFluidLoadable> = DataObjectClass<T> | SharedObjectClass<T>;

/**
 * A DataObjectClass is a class that has a factory that can create a DataObject and a
 * constructor that will return the type of the DataObject.
 * @typeParam T - The class of the DataObject
 */
export type DataObjectClass<T extends IFluidLoadable>
    = { readonly factory: IFluidDataStoreFactory; } & LoadableObjectCtor<T>;

/**
 * A SharedObjectClass is a class that has a factory that can create a DDS (SharedObject) and a
 * constructor that will return the type of the DataObject.
 * @typeParam T - The class of the SharedObject
 */
export type SharedObjectClass<T extends IFluidLoadable>
    = { readonly getFactory: () => IChannelFactory; } & LoadableObjectCtor<T>;

/**
 * An object with a constructor that will return an `IFluidLoadable`.
 * @typeParam T - The class of the loadable object
 */
export type LoadableObjectCtor<T extends IFluidLoadable> = new(...args: any[]) => T;

/**
 * The ContainerSchema declares the Fluid objects that will be available in the container.  It includes both the
 * instances of objects that are initially available upon container creation, as well as the types of objects that may
 * be dynamically created throughout the lifetime of the container.
 */
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
 *
 * ### "membersChanged"
 *
 * The membersChanged event is emitted when a member is either added or removed.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void;
 * ```
 *
 * ### "memberAdded"
 *
 * The memberAdded event is emitted when a member joins the audience.
 *
 * #### Listener signature
 *
 * ```typescript
 * (clientId: string, member: M) => void;
 * ```
 * - `clientId` - A unique identifier for the client
 *
 * - `member` - The service-specific member object for the client
 *
 * ### "memberRemoved"
 *
 * The memberRemoved event is emitted when a member leaves the audience.
 *
 * #### Listener signature
 *
 * ```typescript
 * (clientId: string, member: M) => void;
 * ```
 * - `clientId` - A unique identifier for the client
 *
 * - `member` - The service-specific member object for the client
 * @typeParam M - A service-specific member type.
 */
export interface IServiceAudienceEvents<M extends IMember> extends IEvent {
    (event: "membersChanged", listener: () => void): void;
    (event: "memberAdded" | "memberRemoved", listener: (clientId: string, member: M) => void): void;
}

/**
 * Base interface to be implemented to fetch each service's audience. The generic M allows consumers to further
 * extend the client object with service-specific details about the connecting client, such as device information,
 * environment, or a username.
 * @typeParam M - A service-specific member type.
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
 * Base interface for information for each connection made to the Fluid session.  This interface can be extended
 * to provide additional information specific to each service.
 */
export interface IConnection {
    /**
     * A unique ID for the connection.  A single user may have multiple connections, each with a different ID.
     */
    id: string;

    /**
     * Whether the connection is in read or read/write mode.
     */
    mode: "write" | "read";
}

/**
 * Base interface to be implemented to fetch each service's member.  This interface can be extended by each service
 * to provide additional service-specific user metadata.
 */
export interface IMember {
    /**
     * An ID for the user, unique among each individual user connecting to the session.
     */
    userId: string;

    /**
     * The set of connections the user has made, e.g. from multiple tabs or devices.
     */
    connections: IConnection[];
}
