/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link GetTelemetryHistory.Message}.
 *
 * @internal
 */
export namespace GetTelemetryHistory {
	/**
	 * {@link GetTelemetryHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "GET_TELEMETRY_HISTORY";

	/**
	 * Inbound message requesting a complete history of telemetry events.
	 *
	 * @internal
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
	 * @internal
	 */
	export function createMessage(): Message {
		return {
			data: undefined,
			type: MessageType,
		};
	}
}
