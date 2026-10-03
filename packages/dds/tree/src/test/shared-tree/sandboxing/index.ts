/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SandboxEndpointOptions } from "./common.js";
import {
	createGuest as createGuestInternal,
	type Guest as GuestBase,
	type GuestOptions as GuestOptionsBase,
} from "./guest.js";
import {
	createHost as createHostInternal,
	type Host as HostBase,
	type HostOptions as HostOptionsBase,
} from "./host.js";

/**
 * APIs for synchronizing a SharedTree view across a sandbox boundary.
 */
export namespace Sandboxing {
	/**
	 * Session options shared by the Host and Guest endpoints.
	 *
	 * @input
	 */
	export type EndpointOptions = SandboxEndpointOptions;

	/**
	 * Options for creating a Host.
	 *
	 * @input
	 */
	export type HostOptions = HostOptionsBase;

	/**
	 * The SharedTree endpoint that connects to Fluid services on behalf of a {@link Sandboxing.Guest}.
	 *
	 * @sealed
	 */
	export type Host = HostBase;

	/**
	 * Creates and connects a Host that can support a {@link Sandboxing.Guest}.
	 *
	 * @param options - The options for creating the Host.
	 * @returns The created Host.
	 */
	export function createHost(options: HostOptions): Host {
		return createHostInternal(options);
	}

	/**
	 * Options for creating a Guest.
	 *
	 * @input
	 */
	export type GuestOptions = GuestOptionsBase;

	/**
	 * An independent tree synchronized with a {@link Sandboxing.Host}.
	 *
	 * @sealed
	 */
	export type Guest = GuestBase;

	/**
	 * Creates and connects a Guest to a {@link Sandboxing.Host}.
	 *
	 * @param options - The options for creating the Guest.
	 * @returns A promise that resolves to the created Guest.
	 */
	export async function createGuest(options: GuestOptions): Promise<Guest> {
		return createGuestInternal(options);
	}
}
