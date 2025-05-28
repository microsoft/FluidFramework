/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey, HasFluidObjectKey } from "../../CommonInterfaces.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link GetDataVisualization.Message}.
 *
 * @internal
 */
export namespace GetDataVisualization {
	/**
	 * {@link GetDataVisualization.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "GET_DATA_VISUALIZATION";

	/**
	 * Message data format used by {@link GetDataVisualization.Message}.
	 *
	 * @internal
	 */
	export type MessageData = HasContainerKey & HasFluidObjectKey;

	/**
	 * Inbound message requesting a visualization for a specific DDS via its associated {@link HasFluidObjectKey.fluidObjectKey}.
	 *
	 * Will result in the {@link DataVisualization.Message} message being posted.
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
	 * Creates a {@link GetDataVisualization.Message} from the provided {@link GetDataVisualization.MessageData}.
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
