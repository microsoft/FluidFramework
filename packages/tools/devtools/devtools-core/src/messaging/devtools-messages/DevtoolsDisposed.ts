/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link DevtoolsDisposed.Message}.
 *
 * @internal
 */
export namespace DevtoolsDisposed {
	/**
	 * {@link DevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "DEVTOOLS_DISPOSED";

	/**
	 * Outbound message indicating that the {@link IFluidDevtools} has been disposed.
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
	 * Creates a {@link DevtoolsDisposed.Message}.
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
