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
	 * Whether the persisted document schema permits publishing configured channels of this type.
	 * A local creation option alone does not make the type active.
	 */
	readonly isChannelConfigurationEnabled?: (type: string) => boolean;
	/**
	 * Whether local deployment options permit creating configured channels of this type.
	 * This is separate from reading or publishing already adopted types.
	 */
	readonly isChannelConfigurationCreationEnabled?: (type: string) => boolean;
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
