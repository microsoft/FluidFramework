/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link ToggleUnsampledTelemetry.Message}.
 *
 * @internal
 */
export namespace ToggleUnsampledTelemetry {
	/**
	 * {@link DevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "TOGGLE_UNSAMPLED_TELEMETRY";

	/**
	 * Message data format used by {@link ToggleUnsampledTelemetry.Message}.
	 *
	 * @internal
	 */
	export interface MessageData {
		/**
		 * String representation of whether unsampled telemetry should be enabled or disabled. True for enabled, false for disabled.
		 */
		unsampledTelemetry: string;
	}

	/**
	 * Outbound message indicating that the {@link IFluidDevtools} has been disposed.
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
	 * Creates a {@link ToggleUnsampledTelemetry.Message} from the provided {@link ToggleUnsampledTelemetry.MessageData}.
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
