/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @alpha
 */
export enum ConnectionState {
	/**
	 * The container is not connected to the ordering service
	 * Note - When in this state the container may be about to reconnect,
	 * or may remain disconnected until explicitly told to connect.
	 */
	Disconnected = 0,

	/**
	 * The container is disconnected but actively trying to establish a new connection
	 * PLEASE NOTE that this numerical value falls out of the order you may expect for this state
	 */
	EstablishingConnection = 3,

	/**
	 * The container has an inbound connection only, and is catching up to the latest known state from the service.
	 */
	CatchingUp = 1,

	/**
	 * The container is fully connected and syncing
	 */
	Connected = 2,
}
