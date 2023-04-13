/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetContainerList.Message}.
 *
 * @public
 */
export namespace GetContainerList {
	/**
	 * {@link GetContainerList.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_CONTAINER_LIST";

	/**
	 * Inbound message requesting the list of Containers for which Devtools have been registered.
	 * Will result in the {@link ContainerList.Message} message being posted.
	 *
	 * @public
	 */
	export interface Message extends IDebuggerMessage<undefined> {
		/**
		 * {@inheritDoc IDebuggerMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link GetContainerList.Message}.
	 *
	 * @public
	 */
	export function createMessage(): Message {
		return {
			data: undefined,
			type: MessageType,
		};
	}
}
