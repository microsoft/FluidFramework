/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/protocol-definitions";
/**
 * Manages the state and the members for {@link IAudience}
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
	 * Notifies Audience that "self" has changed.
	 * See IAudience.self and IAudienceEvents' "selfChanged" event for more details
	 */
	setSelf(clientId: string | undefined): void;
}

/**
 * @public
 */
export interface IAudienceEvents extends IEvent {
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	(
		event: "addMember" | "removeMember" | "selfChanged",
		listener: (clientId: string, client: IClient) => void,
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
	 * Returns this client's clientId, if it exists. undefined if this client never connected to ordering service.
	 * Whenever this property changes, "selfChanged" event is fired on this object.
	 * Wheneever clients loses connection and reconnects, it will raise "connected" event at various API surfaces.
	 * It's guranteed that such events and change of self clientId happens at the same time (syncronously, one after another).
	 * 
	 * That said, at the moment this is experimental API. It depends on some experimental settings that might change in the future.
	 * While it's marked experimental, you break in above described promise, where you could experience "self" being changed
	 * (and "selfChanged" event fired) while you can't find such clientId in the list of audience clients.
	 * @experimental
	 */
	readonly self: string | undefined;
}
