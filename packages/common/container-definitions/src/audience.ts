/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/protocol-definitions";
/**
 * Manages the state and the members for {@link IAudience}
 * @internal
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
	 * See {@link IAudience.currentClientId} and {@link IAudienceEvents}'s "clientIdChanged" event for more details.
	 */
	setCurrentClientId(clientId: string | undefined): void;
}

/**
 * @public
 */
export interface IAudienceEvents extends IEvent {
	(
		event: "addMember" | "removeMember",
		listener: (clientId: string, client: IClient) => void,
	): void;
	(
		event: "clientIdChanged",
		listener: (oldClientId: string | undefined, clientId: string) => void,
	): void;
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
	 * Returns this client's clientId. undefined if this client has never connected to the ordering service.
	 * It changes only when client has reconnected and caught up with latest ops.
	 * In other words, the value k
	 *
	 * @experimental
	 *
	 * @remarks
	 * This API is experimental.
	 *
	 * It's guaranteed that these events happen at the same time (synchronously, one after another):
	 * 1. "clientIdChanged" event on this object fires
	 * 2. the change of current clientId
	 * 3. current clientId is added to members of audience
	 * If  "connected" event fires, it will fire at the same time. "connected" event may not fired at some layers (like container runtime layer)
	 * in some cases (like user has read-only permissions to container).
	 *
	 * Whenever this property changes, the "clientIdChanged" event is fired on this object.
	 * That said, at the moment this is an experimental API. It depends on some experimental settings that might change in the future.
	 * And application that deploy loader & container runtime bundles independently will see new (synchronized) behavior only when loader changes are deployed.
	 * Newer runtimes will continue to observe old (non-synchronized) behavior when paired with older loader code.
	 *
	 * While it's marked as experimental, this promise could be broken, and consumers could experience current clientId being changed
	 * (and "clientIdChanged" event fired) while (only applicable for "read" kind of connections)
	 * 1. Such clientId is not present in Audience
	 * 2. Client is not fully caught up
	 */
	readonly currentClientId: string | undefined;
}
