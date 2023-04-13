/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { RootHandleNode } from "../../data-visualization";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link RootDataVisualizations.Message}.
 *
 * @public
 */
export namespace RootDataVisualizations {
	/**
	 * {@link RootDataVisualizations.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "ROOT_DATA_VISUALIZATIONS";

	/**
	 * Message data format used by {@link RootDataVisualizations.Message}.
	 *
	 * @public
	 */
	export interface MessageData extends HasContainerId {
		/**
		 * List of root Fluid objects.
		 *
		 * @remarks Will be `undefined` iff the debugger has no data registered for visualization.
		 */
		visualizations: Record<string, RootHandleNode> | undefined;
	}

	/**
	 * Outbound message containing the visual descriptions of the root DDSs associated
	 * with the debugger.
	 *
	 * @public
	 */
	export interface Message extends IDebuggerMessage<MessageData> {
		/**
		 * {@inheritDoc IDebuggerMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link RootDataVisualizations.Message} from the provided {@link RootDataVisualizations.MessageData}.
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
