/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the attributes of a channel/DDS.
 * @public
 */
export interface IChannelAttributes {
	/**
	 * Type name of the DDS for factory look up with ISharedObjectRegistry
	 */
	readonly type: string;

	/**
	 * Format version of the snapshot
	 * Currently, only use to display a debug message if the version is incompatible
	 */
	readonly snapshotFormatVersion: string;

	/**
	 * The package version of the code of the DDS, for debug only
	 */
	readonly packageVersion?: string;
}
