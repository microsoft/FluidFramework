/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerKey } from "../../CommonInterfaces.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link ContainerList.Message}.
 *
 * @internal
 */
export namespace ContainerList {
	/**
	 * {@link ContainerList.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "CONTAINER_LIST";

	/**
	 * Message data format used by {@link ContainerList.Message}.
	 *
	 * @internal
	 */
	export interface MessageData {
		/**
		 * List of keys for the Containers registered with the Devtools.
		 */
		containers: ContainerKey[];
	}

	/**
	 * Outbound message containing the list of Container-level devtools instances tracked by the root Devtools.
	 *
	 * Includes the new list of active {@link ContainerKey}s associated with active Container Devtools instances.
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
	 * Creates a {@link ContainerList.Message} from the provided {@link ContainerList.MessageData}.
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
