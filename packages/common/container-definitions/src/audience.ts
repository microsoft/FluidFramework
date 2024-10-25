/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/driver-definitions";
/**
 * Manages the state and the members for {@link IAudience}
 * @legacy
 * @alpha
 */
export interface IAudienceOwner extends IAudience {
	/**
	 * Adds a new client to the audience
	 */
	addMember(clientId: string, details: IClient): void;

	/**
	 * Removes a client from the audience. Only emits an event if a client is actually removed
	 * @returns if a client was removed from the audience
	 */
	removeMember(clientId: string): boolean;

	/**
	 * Notifies Audience that current clientId has changed.
	 * See {@link IAudience.getSelf} and {@link IAudienceEvents}'s "selfChanged" event for more details.
	 */
	setCurrentClientId(clientId: string): void;
}

/**
 * Interface describing Audience events
 * @public
 */
export interface IAudienceEvents extends IEvent {
	/**
	 * Raised when a new user joins collaborative session.
	 *
	 * @param clientId - clientId of the new user that joined.
	 * @param client - Information about the new user that joined (including user identity, connection properties).
	 *
	 * @eventProperty
	 */
	(event: "addMember", listener: (clientId: string, client: IClient) => void): void;

	/**
	 * Raised when a user leaves collaborative session.
	 *
	 * @param clientId - clientId of the user that left.
	 * @param client - Information about the user that left (including user identity, connection properties).
	 *
	 * @eventProperty
	 */
	(event: "removeMember", listener: (clientId: string, client: IClient) => void): void;
	/**
	 * Notifies that client established new connection and caught-up on ops.
	 * @param oldValue - represents old connection. Please note that oldValue.client in almost all cases will be undefined,
	 * due to specifics how Audience refreshes on reconnect. In the future we could improve it and always provide client information.
	 * @param newValue - represents newly established connection. While {@link IAudience.getSelf} is experimental, it's not guaranteed that
	 * newValue.client is present. Same is true if you are consuming audience from container runtime layer and running against old version of loader.
	 */
	(
		event: "selfChanged",
		listener: (oldValue: ISelf | undefined, newValue: ISelf) => void,
	): void;
}

/**
 * Return type of {@link IAudience.getSelf}. Please see remarks for {@link IAudience.getSelf} to learn more details on promises.
 * @public
 */
export interface ISelf {
	/**
	 * clientId of current or previous connection (if client is in disconnected or reconnecting / catching up state)
	 * It changes only when client has reconnected, caught up with latest ops.
	 */
	readonly clientId: string;

	/**
	 * Information about current client (including user identity, connection properties), supplied by ordering service when
	 * client connected to it and received {@link ISelf.clientId}.
	 * If present (not undefined), it's same value as calling IAudience.getMember(clientId).
	 * This property could be undefined even if there is non-undefined clientId.
	 * This could happen in the following cases:
	 * 1) Container was loaded from stash, by providing IPendingContainerState state to Container.load().
	 * 2) Container is in the process of establishing new connection. Information about old connection is already reset
	 * (old clientId is no longer in list of members), but clientId has not yet changed to a new value.
	 */
	readonly client?: IClient;
}

/**
 * Represents all clients connected to the op stream, both read-only and read/write.
 *
 * @remarks Access to the Audience when a container is disconnected is a tricky subject.
 * See the remarks on specific methods for more details.
 *
 * @public
 */
export interface IAudience extends IEventProvider<IAudienceEvents> {
	/**
	 * List all clients connected to the op stream, keyed off their clientId.
	 *
	 * @remarks When the container is disconnected, there are no guarantees about the correctness of what this method returns.
	 * The default implementation in Fluid Framework continues to return the list of members as it last saw it before the
	 * container disconnected, but this could change in the future. Other implementations could decide to return an empty
	 * list, or a list that only includes the local client.
	 *
	 * Note that the clientId that a disconnected container might see for itself is an old one. A disconnected container
	 * does not technically have a clientId tied to an active connection to the service.
	 */
	getMembers(): Map<string, IClient>;

	/**
	 * Get details about the connected client with the specified clientId, or undefined if the specified client isn't connected.
	 *
	 * @remarks When the container is disconnected, there are no guarantees about the correctness of what this method returns.
	 * The default implementation in Fluid Framework continues to return members that were part of the audience when the
	 * container disconnected, but this could change in the future. Other implementations could decide to always return
	 * undefined, or only return an IClient when the local client is requested.
	 *
	 * Note that the clientId that a disconnected container might see for itself is an old one. A disconnected container
	 * does not technically have a clientId tied to an active connection to the service.
	 */
	getMember(clientId: string): IClient | undefined;

	/**
	 * Returns information about client's connection. Please see {@link ISelf} member descriptions for more details.
	 * undefined if this client has never connected to the ordering service.
	 * Please see {@link ISelf.clientId} for more details on when values returned by this function change over time.
	 *
	 * @experimental
	 *
	 * @remarks
	 * This API is experimental.
	 *
	 * Reconnection process will have these phases:
	 * 1. Establishing connection phase:
	 * - new connection clientId is added to member's list. That said, self.clientId still reflects old information.
	 * - The old client's information is removed from members' list. getMember(self.clientId) will return undefined.
	 * 2. Catch-up phase. Client catches up on latest ops and becomes current.
	 * 3. "connect" phase - the following happens synchronously:
	 * - getSelf() information changes to reflect new connection
	 * - "selfChanged" event on this object fires
	 * - Various API surfaces may expose "connected" event. This event fires at the same time as self changes. That said, "connected" event will not fire at IContainerRuntime layer if container is read-only.
	 *
	 * That said, at the moment this is an experimental API. It depends on some experimental settings that might change in the future.
	 * Events described in phase #3 may not happen at the same time if kill-bit feature gates are engaged due to a bug discovered in new logic
	 * that delivers this functionality. Once it's proven (at scale) that everything works well, experimental tag will be removed.
	 * Also application that deploy loader & container runtime bundles independently will see new (synchronized) behavior only when loader changes are deployed.
	 * Newer runtimes will continue to observe old (non-synchronized) behavior when paired with older loader code.
	 *
	 * When promises in phase #3 are broken (due to conditions described above), consumers could experience current clientId being changed
	 * (and "selfChanged" event fired) while
	 * 1. Such clientId is not present in Audience
	 * 2. Client is not fully caught up
	 */
	getSelf(): ISelf | undefined;
}
