/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable } from "@fluidframework/common-definitions";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";

import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";

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
export interface IContainerDevtools extends IDisposable {
	/**
	 * The ID of {@link IContainerDevtools.container}.
	 */
	readonly containerId: string;

	/**
	 * The Container session with which the debugger is associated.
	 */
	readonly container: IContainer;

	/**
	 * The Audience associated with the Container
	 */
	readonly audience: IAudience;

	/**
	 * Data contents of the Container.
	 *
	 * @remarks
	 *
	 * This map is assumed to be immutable. The debugger will not make any modifications to its contents.
	 */
	readonly containerData?: IFluidLoadable | Record<string, IFluidLoadable>;

	/**
	 * Optional: Nickname to assign to the debugger instance.
	 *
	 * @remarks
	 *
	 * Associated tooling may take advantage of this to differentiate between instances using
	 * semantically meaningful information.
	 *
	 * If not provided, the {@link IContainerDevtools.containerId} will be used for the purpose of distinguishing
	 * instances.
	 */
	readonly containerNickname?: string;

	/**
	 * Gets the history of all ConnectionState changes since the debugger session was initialized.
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
	 * Disposes the debugger session.
	 * All data recording will stop, and no further state change events will be emitted.
	 */
	dispose(): void;
}
