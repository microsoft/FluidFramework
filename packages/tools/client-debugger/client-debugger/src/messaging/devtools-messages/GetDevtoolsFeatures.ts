/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetDevtoolsFeatures.Message}.
 *
 * @public
 */
export namespace GetDevtoolsFeatures {
	/**
	 * {@link GetDevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_DEVTOOLS_FEATURES";

	/**
	 * Inbound message requesting the set of features supported by the {@link FluidDevtools} instance.
	 * Will result in the {@link DevtoolsFeatures.Message} message being posted.
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
	 * Creates a {@link GetDevtoolsFeatures.Message}.
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
