/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId, HasFluidObjectId } from "../../CommonInterfaces";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetDataVisualization.Message}.
 *
 * @public
 */
export namespace GetDataVisualization {
	/**
	 * {@link GetDataVisualization.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_DATA_VISUALIZATION";

	/**
	 * Message data format used by {@link GetDataVisualization.Message}.
	 *
	 * @public
	 */
	export type MessageData = HasContainerId & HasFluidObjectId;

	/**
	 * Inbound message requesting a visualization for a specific DDS via its associated {@link HasFluidObjectId.fluidObjectId}.
	 *
	 * Will result in the {@link DataVisualization.Message} message being posted.
	 *
	 * @public
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
	 * @public
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
