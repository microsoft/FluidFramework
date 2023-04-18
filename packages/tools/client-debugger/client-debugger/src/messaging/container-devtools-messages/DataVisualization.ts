/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId, HasFluidObjectId } from "../../CommonInterfaces";
import { FluidObjectNode } from "../../data-visualization";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link DataVisualization.Message}.
 *
 * @public
 */
export namespace DataVisualization {
	/**
	 * {@link DataVisualization.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "DATA_VISUALIZATION";

	/**
	 * Message data format used by {@link DataVisualization.Message}.
	 *
	 * @public
	 */
	export interface MessageData extends HasContainerId, HasFluidObjectId {
		/**
		 * A visual description tree for a particular DDS.
		 *
		 * Will be undefined only if the debugger has no data associated with the provided
		 * {@link HasFluidObjectId.fluidObjectId | ID}.
		 */
		visualization: FluidObjectNode | undefined;
	}

	/**
	 * Outbound message containing a visual description of the DDS associated with {@link HasFluidObjectId.fluidObjectId}.
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
	 * Creates a {@link DataVisualization.Message} from the provided {@link DataVisualization.MessageData}.
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
