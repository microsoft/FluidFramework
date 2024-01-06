/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ITimestampedTelemetryEvent } from "../../TelemetryMetadata";
import { type IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link TelemetryHistory.Message}.
 *
 * @internal
 */
export namespace TelemetryHistory {
	/**
	 * {@link TelemetryHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 */
	export const MessageType = "TELEMETRY_HISTORY";

	/**
	 * Message data format used by {@link TelemetryHistory.Message}.
	 *
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
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link TelemetryHistory.Message} from the provided {@link TelemetryHistory.MessageData}.
	 *
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
