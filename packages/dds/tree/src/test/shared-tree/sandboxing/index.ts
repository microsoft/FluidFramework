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
	/* eslint-disable tsdoc/syntax -- Test-source TSDoc lint does not load the package's custom @input tag. */
	/**
	 * {@inheritDoc SandboxEndpointOptions}
	 *
	 * @input
	 */
	export type EndpointOptions = SandboxEndpointOptions;
	/* eslint-enable tsdoc/syntax */

	/* eslint-disable tsdoc/syntax -- Test-source TSDoc lint does not load the package's custom @input tag. */
	/**
	 * {@inheritDoc HostOptionsBase}
	 *
	 * @input
	 */
	export type HostOptions = HostOptionsBase;
	/* eslint-enable tsdoc/syntax */

	/**
	 * {@inheritDoc HostBase}
	 *
	 * @sealed
	 */
	export type Host = HostBase;

	/** {@inheritDoc createHostInternal} */
	export function createHost(options: HostOptions): Host {
		return createHostInternal(options);
	}

	/* eslint-disable tsdoc/syntax -- Test-source TSDoc lint does not load the package's custom @input tag. */
	/**
	 * {@inheritDoc GuestOptionsBase}
	 *
	 * @input
	 */
	export type GuestOptions = GuestOptionsBase;
	/* eslint-enable tsdoc/syntax */

	/**
	 * {@inheritDoc GuestBase}
	 *
	 * @sealed
	 */
	export type Guest = GuestBase;

	/** {@inheritDoc createGuestInternal} */
	export async function createGuest(options: GuestOptions): Promise<Guest> {
		return createGuestInternal(options);
	}
}
