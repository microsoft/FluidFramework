/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetTelemetryHistory.Message}.
 *
 * @internal
 */
export namespace GetTelemetryHistory {
	/**
	 * {@link GetTelemetryHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 */
	export const MessageType = "GET_TELEMETRY_HISTORY";

	/**
	 * Inbound message requesting a complete history of telemetry events.
	 *
	 */
	export interface Message extends IDevtoolsMessage<undefined> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link GetTelemetryHistory.Message}.
	 *
	 */
	export function createMessage(): Message {
		return {
			data: undefined,
			type: MessageType,
		};
	}
}
