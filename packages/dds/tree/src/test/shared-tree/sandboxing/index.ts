/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SandboxEndpointOptions } from "./common.js";
import {
	createGuest as createGuestInternal,
	type Guest as GuestInternal,
	type GuestOptions as GuestOptionsInternal,
} from "./guest.js";
import {
	createHost as createHostInternal,
	type Host as HostInternal,
	type HostOptions as HostOptionsInternal,
} from "./host.js";

/**
 * APIs for synchronizing a SharedTree view across a sandbox boundary.
 */
export namespace Sandboxing {
	/**
	 * Session options shared by the Host and Guest endpoints.
	 */
	export type EndpointOptions = SandboxEndpointOptions;

	/**
	 * Options for creating a Host.
	 */
	export type HostOptions = HostOptionsInternal;

	/**
	 * The SharedTree endpoint that connects to Fluid services on behalf of a {@link Sandboxing.Guest}.
	 */
	export type Host = HostInternal;

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
	 */
	export type GuestOptions = GuestOptionsInternal;

	/**
	 * An independent tree synchronized with a {@link Sandboxing.Host}.
	 */
	export type Guest = GuestInternal;

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
