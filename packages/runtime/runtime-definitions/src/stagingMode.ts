/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeBase } from "./dataStoreContext.js";

/**
 * @experimental
 * @deprecated - These APIs are unstable, and can be changed at will. They should only be used with direct agreement with the Fluid Framework.
 * @legacy @beta
 * @sealed
 */
export interface CommitStagedChangesOptionsExperimental {
	/**
	 * If true, intermediate states created by changes made while in staging mode will be "squashed" out of the
	 * ops which were created during staging mode.
	 * Defaults to false.
	 * @remarks
	 * The squash parameter is analogous to `git squash` but differs in a notable way: ops created by a client exiting staging mode
	 * are not necessarily coalesced into a single op or something like it.
	 * It still does have the desirable property that "unnecessary changes" (such as inserting some content then removing it) will
	 * be removed from the set of submitted ops, which means it helps reduce network traffic and the chance of unwanted data being
	 * persisted--even if only temporarily--in the document.
	 *
	 * By not attempting to reduce the set of changes to a single op a la `git squash`, we can better preserve the ordering of
	 * changes that remote clients see such that they better align with the client which submitted the changes.
	 */
	squash?: boolean;
}

/**
 * @experimental
 * @deprecated - These APIs are unstable, and can be changed at will. They should only be used with direct agreement with the Fluid Framework.
 * @legacy @beta
 * @sealed
 */
export interface StageControlsExperimental {
	/**
	 * Exit staging mode and commit to any changes made while in staging mode.
	 * This will cause them to be sent to the ordering service, and subsequent changes
	 * made by this container will additionally flow freely to the ordering service.
	 * @param options - Options when committing changes.
	 */
	readonly commitChanges: (options?: Partial<CommitStagedChangesOptionsExperimental>) => void;
	/**
	 * Exit staging mode and discard any changes made while in staging mode.
	 */
	readonly discardChanges: () => void;
}

/**
 * @legacy @alpha
 * @sealed
 */
export interface StageControlsAlpha {
	/**
	 * Exit staging mode and commit to any changes made while in staging mode.
	 * This will cause them to be sent to the ordering service, and subsequent changes
	 * made by this container will additionally flow freely to the ordering service.
	 */
	readonly commitChanges: () => void;
	/**
	 * Exit staging mode and discard any changes made while in staging mode.
	 */
	readonly discardChanges: () => void;
}

/**
 * @experimental
 * @deprecated These APIs are unstable, and can be changed at will. They should only be used with direct agreement with the Fluid Framework.
 * @legacy @beta
 * @sealed
 */
export interface IContainerRuntimeBaseExperimental extends IContainerRuntimeBase {
	enterStagingMode?(): StageControlsExperimental;
	readonly inStagingMode?: boolean;
}
/**
 * @legacy @alpha
 * @sealed
 */
export interface ContainerRuntimeBaseAlpha {
	enterStagingMode(): StageControlsAlpha;
	readonly inStagingMode?: boolean;
}
