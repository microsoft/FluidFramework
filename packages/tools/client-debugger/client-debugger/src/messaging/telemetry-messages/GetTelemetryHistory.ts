/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetTelemetryHistory.Message}.
 *
 * @public
 */
export namespace GetTelemetryHistory {
	/**
	 * {@link GetTelemetryHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_TELEMETRY_HISTORY";

	/**
	 * Inbound message requesting a complete history of telemetry events.
	 *
	 * @public
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
	 * @public
	 */
	export function createMessage(): Message {
		return {
			data: undefined,
			type: MessageType,
		};
	}
}
