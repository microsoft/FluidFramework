/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetTelemetryHistory.Message}.
 *
 * @public
 */
export namespace GetTelemetryHistory {
	/**
	 * {@link GetTelemetryHistory.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_TELEMETRY_HISTORY";

	/**
	 * Inbound message requesting a complete history of telemetry events.
	 *
	 * @public
	 */
	export interface Message extends IDebuggerMessage<undefined> {
		/**
		 * {@inheritDoc IDebuggerMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link GetTelemetryHistory.Message}.
	 *
	 * @public
	 */
	export function createMessage(): Message {
		return {
			data: undefined,
			type: MessageType,
		};
	}
}
