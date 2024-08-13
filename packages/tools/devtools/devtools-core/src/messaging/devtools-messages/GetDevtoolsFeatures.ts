/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link GetDevtoolsFeatures.Message}.
 *
 * @internal
 */
export namespace GetDevtoolsFeatures {
	/**
	 * {@link GetDevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "GET_DEVTOOLS_FEATURES";

	/**
	 * Inbound message requesting the set of features supported by the {@link IFluidDevtools} instance.
	 * Will result in the {@link DevtoolsFeatures.Message} message being posted.
	 *
	 * @internal
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
	 * @internal
	 */
	export function createMessage(): Message {
		return {
			data: undefined,
			type: MessageType,
		};
	}
}
