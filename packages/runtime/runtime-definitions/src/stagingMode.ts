/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeBase, StageControls } from "./dataStoreContext.js";

/**
 * Options for committing staged changes in experimental staging mode.
 * @internal
 */
export interface CommitStagedChangesOptionsInternal {
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
 * Controls for managing staged changes in experimental staging mode.
 *
 * Provides methods to either commit or discard changes made while in staging mode.
 * @internal
 */
export interface StageControlsInternal extends StageControls {
	/**
	 * Exit staging mode and commit to any changes made while in staging mode.
	 * This will cause them to be sent to the ordering service, and subsequent changes
	 * made by this container will additionally flow freely to the ordering service.
	 * @param options - Options when committing changes.
	 */
	readonly commitChanges: (options?: Partial<CommitStagedChangesOptionsInternal>) => void;
}

/**
 * Internal extension of {@link IContainerRuntimeBase} whose {@link IContainerRuntimeBaseInternal.enterStagingMode}
 * returns {@link StageControlsInternal} (which exposes internal commit options such as squash)
 * @internal
 */
export interface IContainerRuntimeBaseInternal extends IContainerRuntimeBase {
	/**
	 * Enters staging mode, allowing changes to be staged before being committed or discarded.
	 * @returns Controls for committing or discarding staged changes.
	 */
	enterStagingMode(): StageControlsInternal;
}

/**
 * Controls for managing staged changes in alpha staging mode.
 *
 * Provides methods to either commit or discard changes made while in staging mode.
 *
 * @deprecated Use {@link StageControls} (beta) instead.
 * @legacy @alpha
 * @sealed
 */
export interface StageControlsAlpha extends StageControls {}

/**
 * Alpha extension of {@link IContainerRuntimeBase} that exposes alpha-level APIs.
 *
 * @remarks Use {@link asLegacyAlpha} to obtain an instance from an {@link IContainerRuntimeBase}.
 *
 * @legacy @alpha
 * @sealed
 */
export interface ContainerRuntimeBaseAlpha extends IContainerRuntimeBase {}

/**
 * Converts types to their alpha counterparts to expose alpha functionality.
 * @legacy @alpha
 * @sealed
 */
export function asLegacyAlpha(base: IContainerRuntimeBase): ContainerRuntimeBaseAlpha {
	return base as ContainerRuntimeBaseAlpha;
}
