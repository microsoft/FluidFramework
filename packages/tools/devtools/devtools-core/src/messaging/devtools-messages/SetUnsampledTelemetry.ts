/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link SetUnsampledTelemetry.Message}.
 *
 * @internal
 */
export namespace SetUnsampledTelemetry {
	/**
	 * {@link DevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "TOGGLE_UNSAMPLED_TELEMETRY";

	/**
	 * Message data format used by {@link SetUnsampledTelemetry.Message}.
	 *
	 * @internal
	 */
	export interface MessageData {
		/**
		 * String representation of whether unsampled telemetry should be enabled or disabled. True for enabled, false for disabled.
		 */
		unsampledTelemetry: boolean;
	}

	/**
	 * Message indicating that unsampled telemetry should be enabled/disabled in the Fluid application.
	 * @internal
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link SetUnsampledTelemetry.Message} from the provided {@link SetUnsampledTelemetry.MessageData}.
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
