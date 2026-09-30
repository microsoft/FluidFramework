/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey, HasFluidObjectId } from "../../CommonInterfaces.js";
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
	export type MessageData = HasContainerKey & HasFluidObjectId;

	/**
	 * Inbound message requesting a visualization for a specific DDS via its associated {@link HasFluidObjectId.fluidObjectId}.
	 *
	 * Will result in the {@link DataVisualization.Message} message being posted.
	 *
	 * @remarks
	 *
	 * In addition to requesting the initial visualization, this message registers the consumer's interest in the DDS.
	 * While interest is registered, the devtools will broadcast automatic {@link DataVisualization.Message} updates
	 * whenever the DDS changes.
	 *
	 * Consumers are expected to release their interest by sending a {@link CloseDataVisualization.Message} once they are
	 * no longer displaying the DDS (e.g. when the corresponding view is collapsed or unmounted).
	 * Interest is reference-counted, so each {@link GetDataVisualization.Message} should be balanced by a corresponding
	 * {@link CloseDataVisualization.Message}.
	 * Failing to do so will leak the subscription on the client side and will continue broadcasting updates for the DDS until the
	 * devtools instance is disposed.
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
