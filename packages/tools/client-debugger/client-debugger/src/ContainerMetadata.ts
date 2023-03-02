/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Metadata describing a {@link @fluidframework/container-definitions#IContainer} registered with a debugger.
 *
 * @public
 */
export interface ContainerMetadata {
	/**
	 * The Container ID.
	 */
	id: string;

	/**
	 * Optional Container nickname.
	 *
	 * @remarks
	 *
	 * Associated tooling may take advantage of this to differentiate between container instances using
	 * semantically meaningful names, rather than GUIDs.
	 *
	 * If not provided, the {@link ContainerMetadata.id} will be used for the purpose of distinguising
	 * container instances.
	 */
	nickname?: string;
}
