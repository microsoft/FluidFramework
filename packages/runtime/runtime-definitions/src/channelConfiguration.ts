/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Optional document compatibility capability propagated to data stores and channels.
 * @internal
 */
export interface ChannelConfigurationRuntime {
	/**
	 * Whether the persisted document schema permits publishing configured channels.
	 * A local creation option alone does not make the capability active.
	 */
	readonly channelConfigurationEnabled?: boolean;
	readonly channelConfigurationCreationEnabled?: boolean;
	/**
	 * Whether an attach summary is captured within a published container.
	 */
	readonly channelConfigurationPublicationRequired?: boolean;
	/**
	 * Registers a captured detached channel snapshot for publication before attachment callbacks.
	 * Detached serialization alone does not invoke the callback.
	 */
	readonly registerChannelConfigurationPublication?: (publish: () => void) => void;
}
