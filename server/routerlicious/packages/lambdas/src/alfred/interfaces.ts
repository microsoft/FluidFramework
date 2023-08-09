/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";

/**
 * Body of Collaboration Session Events
 */
export interface IBroadcastSignalEventPayload {
	tenantId: string;
	documentId: string;
	signalContent: string;
}

export interface ICollaborationSessionEvents extends IEvent {
	/**
	 * Emitted when the broadcastSignal endpoint is called by an external
	 * server to communicate with all Fluid clients in a session via signal
	 */
	(
		event: "broadcastSignal",
		listener: (broadcastSignal: IBroadcastSignalEventPayload) => void,
	): void;
}
