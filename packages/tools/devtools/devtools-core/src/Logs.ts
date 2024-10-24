/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IClient } from "@fluidframework/driver-definitions";

import type { ContainerStateChangeKind } from "./Container.js";

/**
 * Base interface for data logs, associating data with a timestamp at which the data was recorded by the devtools.
 *
 * @internal
 */
export interface LogEntry {
	/**
	 * The time at which some data was recorded.
	 */
	timestamp: number;
}

/**
 * Represents a change in some state, coupled with a timestamp.
 *
 * @typeParam TState - The type of state being tracked.
 *
 * @internal
 */
export interface StateChangeLogEntry<TState> extends LogEntry {
	/**
	 * The new state value.
	 */
	newState: TState;
}

/**
 * Represents a {@link @fluidframework/container-loader#ConnectionState} change.
 *
 * @internal
 */
export interface ConnectionStateChangeLogEntry
	extends StateChangeLogEntry<ContainerStateChangeKind> {
	/**
	 * When associated with a new connection (i.e. state transition to
	 * {@link @fluidframework/container-loader#ConnectionState.Connected}), this will be the new client ID.
	 *
	 * Will always be undefined for disconnects.
	 */
	clientId: string | undefined;
}

/**
 * Represents a processed operation (op), paired with a timestamp.
 *
 * @privateRemarks
 *
 * TODOs:
 * - Annotate when the client is me, even though "me" can change. This is useful context when viewing the history.
 *
 * @internal
 */
export interface AudienceChangeLogEntry extends LogEntry {
	/**
	 * The ID of the client that was added or removed.
	 */
	clientId: string;

	/**
	 * Metadata about the client that was added or removed.
	 */
	client: IClient;

	/**
	 * Whether the change represents a client being added to or removed from the collaborative session.
	 */
	changeKind: "joined" | "left";
}
