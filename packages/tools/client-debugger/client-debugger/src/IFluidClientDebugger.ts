/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";

import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";

// TODOs:
// - Data recording configuration (what things the user wishes to subscribe to)

/**
 * Events emitted by {@link IFluidClientDebugger}.
 *
 * @internal
 */
export interface IFluidClientDebuggerEvents extends IEvent {
	/**
	 * Emitted when the {@link IFluidClientDebugger} itself has been disposed.
	 *
	 * @see {@link IFluidClientDebugger.dispose}
	 */
	(event: "disposed", listener: () => void);
}

/**
 * Fluid debug session associated with a Fluid Client via its
 * {@link @fluidframework/container-definitions#IContainer} and
 * {@link @fluidframework/container-definitions#IAudience}.
 *
 * @internal
 */
export interface IFluidClientDebugger
	extends IEventProvider<IFluidClientDebuggerEvents>,
		IDisposable {
	/**
	 * The ID of {@link IFluidClientDebugger.container}.
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
	 * Associated tooling may take advantage of this to differentiate between debugger instances using
	 * semantically meaningful information.
	 *
	 * If not provided, the {@link FluidClientDebuggerProps.containerId} will be used for the purpose of distinguising
	 * debugger instances.
	 */
	readonly containerNickname?: string;

	/**
	 * Gets the history of all ConnectionState changes since the debugger session was initialized.
	 *
	 * @remarks
	 *
	 * {@link IFluidClientDebugger.container}'s `connected` and `disconnected` events signal that this data has changed.
	 * Consumers will need to re-call this to get the most up-to-date data.
	 */
	getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[];

	/**
	 * Historical log of audience member changes.
	 *
	 * @remarks
	 *
	 * {@link IFluidClientDebugger.audience}'s `addMember` and `removeMember` events signal that this data has changed.
	 * Consumers will need to re-call this to get the most up-to-date data.
	 */
	getAudienceHistory(): readonly AudienceChangeLogEntry[];

	/**
	 * Disposes the debugger session.
	 * All data recording will stop, and no further state change events will be emitted.
	 */
	dispose(): void;
}
