/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

import type { ICodecOptions } from "../codec/index.js";
import type { ForestOptions } from "../shared-tree/index.js";
import type { UntypedTreeView, ViewableTree } from "../simple-tree/index.js";

import { createGuest as createGuestInternal } from "./guest.js";
import { createHost as createHostInternal } from "./host.js";

/**
 * APIs for synchronizing a SharedTree view across a sandbox boundary.
 *
 * @remarks
 * The Host remains connected to Fluid services and synchronizes an independent Guest tree through a `MessagePort`.
 *
 * Sandboxing requires the ID compressor's V3 serialization format.
 * Set the container runtime's `oldestSupportedClient` option to `"3.4.0"` or later to enable that format.
 *
 * @alpha
 */
export namespace Sandboxing {
	/**
	 * Session options shared by the Host and Guest endpoints.
	 *
	 * @alpha @input
	 */
	export interface EndpointOptions {
		/** This endpoint's port in the Host and Guest message channel. */
		readonly port: MessagePort;
		/** The endpoint-scoped logger for diagnostic telemetry. */
		readonly logger?: ITelemetryBaseLogger;
		/**
		 * Reports terminal session failure asynchronously.
		 * By default, the error is thrown.
		 */
		readonly handleProtocolError?: (error: Error) => void;
	}

	/**
	 * Options for creating a Host.
	 *
	 * @alpha @input
	 */
	export interface HostOptions extends EndpointOptions {
		/** The application-owned view to synchronize with the Guest. */
		readonly main: UntypedTreeView;
	}

	/**
	 * The SharedTree endpoint that connects to Fluid services on behalf of a {@link Sandboxing.Guest}.
	 *
	 * @alpha
	 */
	export interface Host {
		/** Terminal failure requiring application-managed Host and Guest recreation, if this session failed. */
		readonly error: Error | undefined;
		/** A promise for Guest acknowledgment of pending Host changes, if changes are pending. */
		readonly updateGuestPromise: Promise<void> | undefined;
		/** Stops receiving Guest messages, reclaims the Guest's ID space shard, and releases session resources. */
		dispose(): void;
	}

	/**
	 * Creates and connects a Host that can support a {@link Sandboxing.Guest}.
	 *
	 * @param options - The options for creating the Host.
	 * @returns The created Host.
	 *
	 * @alpha
	 */
	export function createHost(options: HostOptions): Host {
		return createHostInternal(options);
	}

	/**
	 * Options for creating a Guest.
	 *
	 * @alpha @input
	 */
	export interface GuestOptions extends EndpointOptions {
		/** The forest and codec options used to initialize the Guest's tree. */
		readonly treeOptions: ForestOptions & ICodecOptions;
	}

	/**
	 * An independent tree synchronized with a {@link Sandboxing.Host}.
	 *
	 * @alpha
	 */
	export interface Guest {
		/** The independent tree synchronized with the Host. */
		readonly tree: ViewableTree;
		/** Terminal failure requiring application-managed Host and Guest recreation, if this session failed. */
		readonly error: Error | undefined;
		/** A promise for Host acknowledgment of pending Guest changes, if changes are pending. */
		readonly updateHostPromise: Promise<void> | undefined;
		/** Ends the session and releases its resources. */
		dispose(): void;
	}

	/**
	 * Creates and connects a Guest to a {@link Sandboxing.Host}.
	 *
	 * @param options - The options for creating the Guest.
	 * @returns A promise that resolves to the created Guest.
	 *
	 * @alpha
	 */
	export async function createGuest(options: GuestOptions): Promise<Guest> {
		return createGuestInternal(options);
	}
}

export {
	createGuest,
	type Guest,
	type GuestOptions,
	GuestImplementation,
} from "./guest.js";
export {
	createHost,
	type Host,
	type HostOptions,
	HostImplementation,
} from "./host.js";
export {
	type BlobRequestId,
	type BlobRequestMessage,
	type GuestChangeMessage,
	type HandleToken,
	type HostGuestMessage,
	type HostIdRangeMessage,
	type HostUpdateMessage,
	isHandleToken,
	isLocalHandle,
	isSerializedHandle,
	makePromiseWithResolvers,
	normalizeProtocolError,
	parseHostGuestMessage,
	type SandboxEndpointOptions,
	SandboxProtocolError,
	sandboxFormatValidator,
	throwProtocolError,
	validateTreePayloadVocabulary,
} from "./common.js";
export { GuestSynchronization } from "./guestSynchronization.js";
export { GuestTransportCodec } from "./guestTransport.js";
export { HostSynchronization } from "./hostSynchronization.js";
export { HostTransportCodec } from "./hostTransport.js";
export { SandboxSessionEndpoint } from "./session.js";
export { getCheckout, getIdCompressor } from "./synchronizationUtils.js";
export { normalizeTransportData } from "./transport.js";
