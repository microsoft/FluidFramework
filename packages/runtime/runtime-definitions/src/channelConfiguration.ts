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
	 * Whether the persisted document schema permits attaching configured channels of this type.
	 * A local creation option alone does not make the type active.
	 */
	readonly isChannelConfigurationEnabled?: (type: string) => boolean;
	/**
	 * Whether local deployment options permit creating configured channels of this type.
	 * This is separate from reading or attaching already adopted types.
	 */
	readonly isChannelConfigurationCreationEnabled?: (type: string) => boolean;
}
