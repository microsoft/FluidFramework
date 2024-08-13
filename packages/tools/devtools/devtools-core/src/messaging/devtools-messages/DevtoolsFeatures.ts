/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DevtoolsFeatureFlags } from "../../Features.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link DevtoolsFeatures.Message}.
 *
 * @internal
 */
export namespace DevtoolsFeatures {
	/**
	 * {@link DevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "DEVTOOLS_FEATURES";

	/**
	 * Message data format used by {@link DevtoolsFeatures.Message}.
	 *
	 * @internal
	 */
	export interface MessageData {
		/**
		 * Describes the set of features supported by the {@link IFluidDevtools} instance.
		 */
		features: DevtoolsFeatureFlags;

		/**
		 * Package version of devtools-core.
		 */
		devtoolsVersion?: string;

		unsampledTelemetry?: boolean;
	}

	/**
	 * Outbound message containing the set of features supported by the {@link IFluidDevtools} instance.
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
	 * Creates a {@link DevtoolsFeatures.Message} from the provided {@link DevtoolsFeatures.MessageData}.
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
