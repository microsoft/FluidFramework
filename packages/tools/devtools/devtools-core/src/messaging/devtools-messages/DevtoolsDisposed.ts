/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDevtoolsMessage } from "../Messages";

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
<<<<<<< HEAD
	 * Outbound message broadcasting that the devtools instance in the webpage is terminating.
=======
	 * Outbound message indicating that the {@link IFluidDevtools} has been disposed.
>>>>>>> 23c0232c4b1a4d2b40b2bca4c7f8a0854a090887
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
