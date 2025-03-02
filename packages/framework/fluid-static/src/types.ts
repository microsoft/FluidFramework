/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DataObjectKind } from "@fluidframework/aqueduct/internal";
import type { IEvent, IEventProvider, IFluidLoadable } from "@fluidframework/core-interfaces";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base/internal";

/**
 * A mapping of string identifiers to instantiated `DataObject`s or `SharedObject`s.
 * @internal
 */
export type LoadableObjectRecord = Record<string, IFluidLoadable>;

/**
 * A mapping of string identifiers to classes that will later be used to instantiate a corresponding `DataObject`
 * or `SharedObject`.
 */
export type LoadableObjectKindRecord = Record<string, SharedObjectKind>;

/**
 * A kind of `DataObject` or `SharedObject`.
 *
 * @typeParam T - The kind of `DataObject` or `SharedObject`.
 *
 * @privateRemarks
 * There are some edge cases in TypeScript where the order of the members in a union matter.
 * Once such edge case is when multiple members of a generic union partially match, and the type parameter is being inferred.
 * In this case, its better to have the desired match and/or the simpler type first.
 * In this case placing ISharedObjectKind fixed one usage and didn't break anything, and generally seems more likely to work than the reverse, so this is the order being used.
 * This is likely (a bug in TypeScript)[https://github.com/microsoft/TypeScript/issues/45809].
 */
export type LoadableObjectKind<T extends IFluidLoadable = IFluidLoadable> =
	| ISharedObjectKind<T>
	| DataObjectKind<T>;

/**
 * Represents properties that can be attached to a container.
 * @public
 */
export type ContainerAttachProps<T = unknown> = T;

/**
 * Declares the Fluid objects that will be available in the {@link IFluidContainer | Container}.
 *
 * @remarks
 *
 * It includes both the instances of objects that are initially available upon `Container` creation, as well
 * as the types of objects that may be dynamically created throughout the lifetime of the `Container`.
 * @public
 */
export interface ContainerSchema {
	/**
	 * Defines loadable objects that will be created when the {@link IFluidContainer | Container} is first created.
	 *
	 * @remarks It uses the key as the id and the value as the loadable object to create.
	 *
	 * @example
	 *
	 * In the example below two objects will be created when the `Container` is first
	 * created. One with id "map1" that will return a `SharedMap` and the other with
	 * id "pair1" that will return a `KeyValueDataObject`.
	 *
	 * ```typescript
	 * {
	 *   map1: SharedMap,
	 *   pair1: KeyValueDataObject,
	 * }
	 * ```
	 */
	readonly initialObjects: Record<string, SharedObjectKind>;

	/**
	 * Loadable objects that can be created after the initial {@link IFluidContainer | Container} creation.
	 *
	 * @remarks
	 *
	 * Types defined in `initialObjects` will always be available and are not required to be provided here.
	 *
	 * For best practice it's recommended to define all the dynamic types you create even if they are
	 * included via initialObjects.
	 */
	readonly dynamicObjectTypes?: readonly SharedObjectKind[];
}

/**
 * @internal
 */
export interface IProvideRootDataObject {
	readonly IRootDataObject: IRootDataObject;
}

/**
 * Holds the collection of objects that the container was initially created with, as well as provides the ability
 * to dynamically create further objects during usage.
 * @internal
 */
export interface IRootDataObject extends IProvideRootDataObject {
	/**
	 * Provides a record of the initial objects defined on creation.
	 */
	readonly initialObjects: LoadableObjectRecord;

	/**
	 * Dynamically creates a new detached collaborative object (DDS/DataObject).
	 *
	 * @param objectClass - Type of the collaborative object to be created.
	 *
	 * @typeParam T - The class of the `DataObject` or `SharedObject`.
	 */
	create<T>(objectClass: SharedObjectKind<T>): Promise<T>;
}

/**
 * Signature for {@link IMember} change events.
 *
 * @param clientId - A unique identifier for the client.
 * @param member - The service-specific member object for the client.
 *
 * @see See {@link IServiceAudienceEvents} for usage details.
 * @public
 */
export type MemberChangedListener<M extends IMember> = (clientId: string, member: M) => void;

/**
 * Events that trigger when the roster of members in the Fluid session change.
 *
 * @remarks
 *
 * Only changes that would be reflected in the returned map of {@link IServiceAudience}'s
 * {@link IServiceAudience.getMembers} method will emit events.
 *
 * @typeParam M - A service-specific {@link IMember} implementation.
 * @public
 */
export interface IServiceAudienceEvents<M extends IMember> extends IEvent {
	/**
	 * Emitted when a {@link IMember | member}(s) are either added or removed.
	 *
	 * @eventProperty
	 */
	(event: "membersChanged", listener: () => void): void;

	/**
	 * Emitted when a {@link IMember | member} joins the audience.
	 *
	 * @eventProperty
	 */
	(event: "memberAdded", listener: MemberChangedListener<M>): void;

	/**
	 * Emitted when a {@link IMember | member} leaves the audience.
	 *
	 * @eventProperty
	 */
	(event: "memberRemoved", listener: MemberChangedListener<M>): void;
}

/**
 * Base interface to be implemented to fetch each service's audience.
 *
 * @remarks
 *
 * The type parameter `M` allows consumers to further extend the client object with service-specific
 * details about the connecting client, such as device information, environment, or a username.
 *
 * @typeParam M - A service-specific {@link IMember} type.
 * @public
 */
export interface IServiceAudience<M extends IMember>
	extends IEventProvider<IServiceAudienceEvents<M>> {
	/**
	 * Returns an map of all users currently in the Fluid session where key is the userId and the value is the
	 * member object.  The implementation may choose to exclude certain connections from the returned map.
	 * E.g. ServiceAudience excludes non-interactive connections to represent only the roster of live users.
	 */
	getMembers(): ReadonlyMap<string, M>;

	/**
	 * Returns the current active user on this client once they are connected. Otherwise, returns undefined.
	 */
	getMyself(): Myself<M> | undefined;
}

/**
 * Base interface for information for each connection made to the Fluid session.
 *
 * @remarks This interface can be extended to provide additional information specific to each service.
 * @public
 */
export interface IConnection {
	/**
	 * A unique ID for the connection.  A single user may have multiple connections, each with a different ID.
	 */
	readonly id: string;

	/**
	 * Whether the connection is in read or read/write mode.
	 */
	readonly mode: "write" | "read";
}

/**
 * Base interface to be implemented to fetch each service's member.
 *
 * @remarks This interface can be extended by each service to provide additional service-specific user metadata.
 * @public
 */
export interface IMember {
	/**
	 * An ID for the user, unique among each individual user connecting to the session.
	 */
	readonly id: string;

	/**
	 * The set of connections the user has made, e.g. from multiple tabs or devices.
	 */
	readonly connections: IConnection[];
}

/**
 * An extended member object that includes currentConnection
 * @public
 */
export type Myself<M extends IMember = IMember> = M & { readonly currentConnection: string };
