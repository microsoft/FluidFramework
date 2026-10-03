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
	/** {@inheritDoc SandboxEndpointOptions} */
	export type EndpointOptions = SandboxEndpointOptions;

	/** {@inheritDoc HostOptionsBase} */
	export type HostOptions = HostOptionsBase;

	/** {@inheritDoc HostBase} */
	export type Host = HostBase;

	/** {@inheritDoc createHostInternal} */
	export function createHost(options: HostOptions): Host {
		return createHostInternal(options);
	}

	/** {@inheritDoc GuestOptionsBase} */
	export type GuestOptions = GuestOptionsBase;

	/** {@inheritDoc GuestBase} */
	export type Guest = GuestBase;

	/** {@inheritDoc createGuestInternal} */
	export async function createGuest(options: GuestOptions): Promise<Guest> {
		return createGuestInternal(options);
	}
}
