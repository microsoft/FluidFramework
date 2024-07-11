/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { SharedObjectEdit } from "../../data-visualization/index.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link DataEdit.Message}.
 *
 * @internal
 */
export namespace DataEdit {
	/**
	 * {@link DataEdit.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "DATA_EDIT";

	/**
	 * Message data format used by {@link DataEdit.Message}.
	 *
	 * @internal
	 */
	export interface MessageData extends HasContainerKey {
		/**
		 * edit includes a {@link SharedObjectEdit} which constains the information necesary to preform an edit
		 */
		edit: SharedObjectEdit;
	}

	/**
	 * Inbound message for editing a specific DDS via its associated {@link HasFluidObjectId.fluidObjectId}.
	 *
	 * Will result in the DDS being edited.
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
	 * Creates a {@link DataEdit.Message} from the provided {@link DataEdit.MessageData}.
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
