/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExtensionHost as ContainerExtensionHost } from "@fluidframework/container-runtime-definitions/internal";

import type { OutboundPresenceMessage, SignalMessages } from "./protocol.js";

/**
 * Presence {@link ContainerExtension} version of {@link @fluidframework/container-runtime-definitions#ExtensionRuntimeProperties}
 */
export interface ExtensionRuntimeProperties {
	SignalMessages: SignalMessages;
}
/**
 * Presence specific ExtensionHost
 */
export type ExtensionHost = ContainerExtensionHost<ExtensionRuntimeProperties>;

/**
 * This interface is a subset of ExtensionHost that is needed by the Presence States.
 */
export type IEphemeralRuntime = Omit<ExtensionHost, "submitAddressedSignal"> & {
	/**
	 * Submits the signal to be sent to other clients.
	 */
	submitSignal: (message: OutboundPresenceMessage) => void;
};
