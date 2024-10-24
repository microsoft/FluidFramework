/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDisposable } from "@fluidframework/core-interfaces";

import type { HasContainerKey } from "./CommonInterfaces.js";
import type { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs.js";

// TODOs:
// - Data recording configuration (what things the user wishes to subscribe to)
// - Allow consumers to opt out of posting messages to the window?
// - Pass diffs instead of all data in change events (probably requires defining separate full-dump messages from delta messages)

/**
 * Fluid debug session associated with a Fluid Client via its
 * {@link @fluidframework/container-definitions#IContainer} and
 * {@link @fluidframework/container-definitions#IAudience}.
 *
 * @internal
 */
export interface IContainerDevtools extends HasContainerKey, IDisposable {
	/**
	 * Gets the history of all ConnectionState changes since the devtools session was initialized.
	 *
	 * @remarks
	 *
	 * {@link IContainerDevtools.container}'s `connected` and `disconnected` events signal that this data has changed.
	 * Consumers will need to re-call this to get the most up-to-date data.
	 */
	getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[];

	/**
	 * Historical log of audience member changes.
	 *
	 * @remarks
	 *
	 * {@link IContainerDevtools.audience}'s `addMember` and `removeMember` events signal that this data has changed.
	 * Consumers will need to re-call this to get the most up-to-date data.
	 */
	getAudienceHistory(): readonly AudienceChangeLogEntry[];

	/**
	 * Disposes the devtools session.
	 * All data recording will stop, and no further state change events will be emitted.
	 */
	dispose(): void;
}
