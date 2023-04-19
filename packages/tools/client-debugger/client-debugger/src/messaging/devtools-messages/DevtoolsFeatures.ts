/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DevtoolsFeatureFlags as Features } from "../../Features";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link DevtoolsFeatures.Message}.
 *
 * @public
 */
export namespace DevtoolsFeatures {
	/**
	 * {@link DevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "DEVTOOLS_FEATURES";

	/**
	 * Message data format used by {@link DevtoolsFeatures.Message}.
	 *
	 * @public
	 */
	export interface MessageData {
		/**
		 * Describes the set of features supported by the {@link FluidDevtools} instance.
		 */
		features: Features;
	}

	/**
	 * Outbound message containing the set of features supported by the {@link FluidDevtools} instance.
	 *
	 * @public
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link DevtoolsFeatures.Message} from the provided {@link DevtoolsFeatures.MessageData}.
	 *
	 * @public
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
