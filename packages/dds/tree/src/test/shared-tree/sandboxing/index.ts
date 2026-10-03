/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { ICodecOptions } from "../../../codec/index.js";
import type { ForestOptions } from "../../../shared-tree/index.js";
import type { UntypedTreeView, ViewableTree } from "../../../simple-tree/index.js";

import { GuestImplementation } from "./guest.js";
import { HostImplementation } from "./host.js";

/**
 * APIs for synchronizing a SharedTree view across a sandbox boundary.
 */
export namespace Sandboxing {
	/**
	 * Session options shared by the Host and Guest endpoints.
	 * @input
	 */
	export interface EndpointOptions {
		/** This endpoint's port in the Host and Guest message channel. */
		readonly port: MessagePort;
		/** The endpoint-scoped logger for diagnostic telemetry. */
		readonly logger?: TelemetryLoggerExt;
		// TODO: Replace this callback with a `Listenable` event API for session errors and closure.
		/**
		 * Reports terminal session failure asynchronously.
		 * By default, the error is thrown. After a failure, the application must recreate the Host and Guest pair.
		 */
		readonly handleProtocolError?: (error: Error) => void;
	}

	/**
	 * Options for creating a Host.
	 * @input
	 */
	export interface HostOptions extends EndpointOptions {
		// TODO: Use a branch with a forest once it can be supplied without a full view.
		/** The application-owned view to synchronize with the Guest. */
		readonly main: UntypedTreeView;
	}

	/**
	 * The SharedTree that connects to Fluid services on behalf of a {@link Sandboxing.Guest}.
	 * @sealed
	 */
	export interface Host {
		/** Terminal failure requiring application-managed Host and Guest recreation, if this session failed. */
		readonly error: Error | undefined;
		/** A promise for Guest acknowledgment of pending Host changes, if changes are pending. */
		readonly updateGuestPromise: Promise<void> | undefined;
		/**
		 * Stops receiving Guest messages, reclaims the Guest's ID space shard, and releases session resources.
		 */
		dispose(): void;
	}

	/**
	 * Creates and connects a {@link Sandboxing.Host} which can support a {@link Sandboxing.Guest}.
	 * @param options - The options for creating the Host.
	 * @returns The created Host instance.
	 */
	export function createHost(options: HostOptions): Host {
		return new HostImplementation(options);
	}

	/**
	 * Options for creating a Guest.
	 * @input
	 */
	export interface GuestOptions extends EndpointOptions {
		/** The forest and codec options used to initialize the Guest's tree. */
		readonly treeOptions: ForestOptions & ICodecOptions;
	}

	/**
	 * An {@link ViewableTree} synchronized with a Host through a `MessagePort`.
	 *
	 * @remarks
	 * Create using {@link Sandboxing.createGuest}.
	 * While active, the Guest accepts local edits and applies updates from the Host.
	 *
	 * If the session fails, synchronization stops.
	 * Pending promises from {@link Sandboxing.Guest.updateHostPromise} reject, and {@link Sandboxing.Guest.error} remains readable.
	 * The application must not edit the Guest after failure.
	 * It can inspect the authoring view before disposal if the view is still usable.
	 *
	 * {@link Sandboxing.Guest.dispose} stops both directions of synchronization, invalidates the Guest's tree views,
	 * and releases local resources.
	 *
	 * @sealed
	 */
	export interface Guest {
		/**
		 * The independent tree synchronized with the Host.
		 */
		readonly tree: ViewableTree;

		/**
		 * The terminal failure requiring application-managed Host and Guest recreation, if this session failed.
		 *
		 * @remarks This property remains readable after {@link Sandboxing.Guest.dispose}.
		 */
		readonly error: Error | undefined;

		/**
		 * A promise for Host acknowledgment of all pending Guest changes, or `undefined`
		 * if there are no pending changes.
		 *
		 * @remarks
		 * If the Guest makes more changes while the promise is pending, the same promise
		 * waits for those changes too.
		 * The promise rejects on failure or disposal.
		 * Reading this property after failure throws, even after reading {@link Sandboxing.Guest.error}.
		 */
		readonly updateHostPromise: Promise<void> | undefined;

		/**
		 * Stops synchronization and releases local resources synchronously.
		 *
		 * @remarks
		 * This method stops sending Guest changes and applying Host updates.
		 * It closes the message port and disposes the Guest's tree views so they cannot be edited again.
		 *
		 * Pending promises from {@link Sandboxing.Guest.updateHostPromise} reject, even if the Host later applies previously sent changes.
		 * Changes that were never sent may be lost.
		 *
		 * After a failure, the application can inspect the authoring view, if usable,
		 * before calling this method.
		 *
		 * Repeated calls have no effect.
		 */
		dispose(): void;
	}

	/**
	 * Creates and connects a {@link Sandboxing.Guest} to a {@link Sandboxing.Host} using the provided options.
	 *
	 * @param options - The options for creating the Guest, including tree and codec options.
	 *
	 * @returns A promise that resolves to the created Guest instance.
	 */
	export async function createGuest(options: GuestOptions): Promise<Guest> {
		return GuestImplementation.create(options);
	}
}
