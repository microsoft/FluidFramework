/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Provides separate checks for creating configured channels locally and attaching them to a document.
 *
 * Each check uses the stable channel type identifier from its factory attributes. Enabling one type
 * does not enable other channel types. These checks are passed from the container runtime to data
 * stores and channels so the shared configuration protocol does not need DDS-specific knowledge.
 * @internal
 */
export interface ChannelConfigurationRuntime {
	/**
	 * Whether the persisted document schema permits attaching configured channels of this type.
	 * A local creation option alone does not make the type active: the document must record support
	 * before a configured instance can attach.
	 */
	readonly isChannelConfigurationEnabled?: (type: string) => boolean;
	/**
	 * Whether local deployment options permit creating configured channels of this type.
	 * Turning this off prevents new configured instances, but does not prevent reading or attaching
	 * instances of a type that the document already supports.
	 */
	readonly isChannelConfigurationCreationEnabled?: (type: string) => boolean;
}
