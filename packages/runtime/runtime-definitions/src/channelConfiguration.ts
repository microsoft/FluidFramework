/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Reports whether the document supports SharedObject configuration.
 *
 * This capability is passed from the container runtime to data stores and channels.
 * @internal
 */
export interface ChannelConfigurationRuntime {
	/**
	 * Whether the active document schema permits SharedObject configuration.
	 * A local request alone does not enable this capability on an existing document: its schema
	 * proposal must be accepted first. Once enabled, local rollout options cannot disable it.
	 */
	readonly isSharedObjectConfigurationEnabled?: () => boolean;
}
