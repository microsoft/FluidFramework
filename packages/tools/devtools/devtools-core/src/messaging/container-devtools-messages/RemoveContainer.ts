/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link RemoveContainer.Message}.
 *
 * @internal
 */
export namespace RemoveContainer {
	/**
	 * {@link RemoveContainer.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "REMOVE_CONTAINER";

	/**
	 * Inbound message requesting that a specific container be removed from the devtools registry.
	 * Will result in the {@link ContainerList.Message} message being posted with the updated list.
	 *
	 * @internal
	 */
	export interface Message extends IDevtoolsMessage<HasContainerKey> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link RemoveContainer.Message}.
	 *
	 * @internal
	 */
	export function createMessage(containerKey: string): Message {
		return {
			data: { containerKey },
			type: MessageType,
		};
	}
}
