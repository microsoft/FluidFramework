/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
export { getCheckout } from "./synchronizationUtils.js";
export { normalizeTransportData } from "./transport.js";
