/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetContainerList.Message}.
 *
 * @public
 */
export namespace GetContainerList {
	/**
	 * {@link GetContainerList.Message} {@link IDevtoolsMessage."type"}.
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
	export interface Message extends IDevtoolsMessage<undefined> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
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
