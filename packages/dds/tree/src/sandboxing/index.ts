/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { Sandboxing } from "./sandboxing.js";
export { GuestImplementation } from "./guest.js";
export { HostImplementation } from "./host.js";
export {
	type BlobRequestId,
	type BlobRequestMessage,
	type BlobResponseMessage,
	type GuestChangeMessage,
	type GuestToHostMessage,
	getTransportBuffer,
	guestToHostMessageValidator,
	type HandleToken,
	type HostIdRangeMessage,
	type HostToGuestMessage,
	hostToGuestMessageValidator,
	type HostUpdateMessage,
	isHandleToken,
	isLocalHandle,
	isSerializedHandle,
	makePromiseWithResolvers,
	normalizeProtocolError,
	SandboxProtocolError,
	sandboxFormatValidator,
	throwProtocolError,
	type ValidatedGuestToHostMessage,
	type ValidatedHostToGuestMessage,
	validateTreePayloadVocabulary,
} from "./common.js";
export { GuestSynchronization } from "./guestSynchronization.js";
export { GuestTransportCodec } from "./guestTransport.js";
export { HostSynchronization } from "./hostSynchronization.js";
export { HostTransportCodec } from "./hostTransport.js";
export { SandboxSessionEndpoint } from "./session.js";
export { getCheckout, getIdCompressor } from "./synchronizationUtils.js";
export { normalizeTransportData } from "./transport.js";
