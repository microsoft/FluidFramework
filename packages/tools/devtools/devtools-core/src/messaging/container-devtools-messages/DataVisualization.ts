/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey, HasFluidObjectId } from "../../CommonInterfaces.js";
import type { FluidObjectNode } from "../../data-visualization/index.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link DataVisualization.Message}.
 *
 * @internal
 */
export namespace DataVisualization {
	/**
	 * {@link DataVisualization.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "DATA_VISUALIZATION";

	/**
	 * Reasons why a DataVisualization message is being sent.
	 *
	 * @internal
	 */
	export const enum UpdateReason {
		/**
		 * Visualization was requested by user interaction (e.g., clicking to expand tree).
		 * Should not trigger UI animations.
		 */
		UserRequested = "userRequested",

		/**
		 * Visualization updated due to actual data changes in the underlying shared object.
		 * Should trigger UI animations to indicate data has changed.
		 */
		DataChanged = "dataChanged",
	}

	/**
	 * Message data format used by {@link DataVisualization.Message}.
	 *
	 * @internal
	 */
	export interface MessageData extends HasContainerKey, HasFluidObjectId {
		/**
		 * A visual description tree for a particular DDS.
		 *
		 * Will be undefined only if the devtools has no data associated with the provided
		 * {@link HasFluidObjectId.fluidObjectId | ID}.
		 */
		visualization: FluidObjectNode | undefined;

		/**
		 * Reason for this visualization update.
		 * Determines whether UI should show visual feedback (blinking/animation).
		 */
		reason: UpdateReason;
	}

	/**
	 * Outbound message containing a visual description of the DDS associated with {@link HasFluidObjectId.fluidObjectId}.
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
	 * Creates a {@link DataVisualization.Message} from the provided {@link DataVisualization.MessageData}.
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
