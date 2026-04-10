/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	InboundPresenceSignalMessage,
	ProcessSignalFunction,
} from "@fluid-internal/presence-runtime/internal/test-utils";
export {
	assertFinalExpectations,
	assertIdenticalTypes,
	attendeeId1,
	connectionId1,
	createInstanceOf,
	createSpecificAttendeeId,
	createSpiedValidator,
	generateBasicClientJoin,
	initialLocalClientConnectionId,
	localAttendeeId,
	prepareConnectedPresence,
	prepareDisconnectedPresence,
} from "@fluid-internal/presence-runtime/internal/test-utils";
