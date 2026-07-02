/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey, HasFluidObjectId } from "../../CommonInterfaces.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link CloseDataVisualization.Message}.
 *
 * @internal
 */
export namespace CloseDataVisualization {
	/**
	 * {@link CloseDataVisualization.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "CLOSE_DATA_VISUALIZATION";

	/**
	 * Message data format used by {@link CloseDataVisualization.Message}.
	 *
	 * @internal
	 */
	export type MessageData = HasContainerKey & HasFluidObjectId;

	/**
	 * Inbound message signalling that the consumer is no longer displaying the DDS associated with the provided
	 * {@link HasFluidObjectId.fluidObjectId}, and therefore no longer wishes to receive automatic
	 * {@link DataVisualization.Message} updates for it.
	 *
	 * @remarks
	 *
	 * This releases a single subscription previously established via {@link GetDataVisualization.Message}.
	 * The devtools will stop broadcasting updates for the associated DDS once all consumers have released their
	 * interest.
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
	 * Creates a {@link CloseDataVisualization.Message} from the provided {@link CloseDataVisualization.MessageData}.
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
