/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { RootHandleNode } from "../../data-visualization/index.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link RootDataVisualizations.Message}.
 *
 * @internal
 */
export namespace RootDataVisualizations {
	/**
	 * {@link RootDataVisualizations.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "ROOT_DATA_VISUALIZATIONS";

	/**
	 * Message data format used by {@link RootDataVisualizations.Message}.
	 *
	 * @internal
	 */
	export interface MessageData extends HasContainerKey {
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
	 * @internal
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link RootDataVisualizations.Message} from the provided {@link RootDataVisualizations.MessageData}.
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
