/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerKey, HasSharedObjectEdit } from "../../CommonInterfaces";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link SendEditData.Message}.
 *
 * @internal
 */
export namespace SendEditData {
	/**
	 * {@link SendEditData.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "SEND_EDIT_DATA";

	/**
	 * Message data format used by {@link SendEditData.Message}.
	 *
	 * @internal
	 */
	export type MessageData = HasContainerKey & HasSharedObjectEdit;

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
	 * Creates a {@link SendEditData.Message} from the provided {@link SendEditData.MessageData}.
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
