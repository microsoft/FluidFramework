/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITimestampedTelemetryEvent } from "../../TelemetryMetadata";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link TelemetryHistory.Message}.
 *
 * @public
 */
export namespace TelemetryHistory {
	/**
	 * {@link TelemetryHistory.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "TELEMETRY_HISTORY";

	/**
	 * Message data format used by {@link TelemetryHistory.Message}.
	 *
	 * @public
	 */
	export interface MessageData {
		/**
		 * Contents of the telemetry event. This can be a single latest event or all the history events.
		 */
		contents: ITimestampedTelemetryEvent[];
	}

	/**
	 * Outbound message including the entire history of telemetry events.
	 *
	 * @public
	 */
	export interface Message extends IDebuggerMessage<MessageData> {
		/**
		 * {@inheritDoc IDebuggerMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link TelemetryHistory.Message} from the provided {@link TelemetryHistory.MessageData}.
	 *
	 * @public
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
