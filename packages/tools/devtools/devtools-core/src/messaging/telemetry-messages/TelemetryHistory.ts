/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITimestampedTelemetryEvent } from "../../TelemetryMetadata.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link TelemetryHistory.Message}.
 *
 * @internal
 */
export namespace TelemetryHistory {
	/**
	 * {@link TelemetryHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "TELEMETRY_HISTORY";

	/**
	 * Message data format used by {@link TelemetryHistory.Message}.
	 *
	 * @internal
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
	 * @internal
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
	 * @internal
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
