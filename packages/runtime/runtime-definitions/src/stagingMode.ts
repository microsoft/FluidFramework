/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

import type { IContainerRuntimeBase } from "./dataStoreContext.js";

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
 * Experimental extension of {@link IContainerRuntimeBase} to support staging mode.
 * @internal
 */
export interface IContainerRuntimeBaseInternal extends IContainerRuntimeBase {
	/**
	 * Indicates whether the container is currently in staging mode.
	 */
	readonly inStagingMode: boolean;
}

/**
 * Events emitted by {@link IStagingController}.
 *
 * @legacy @alpha
 */
export interface IStagingControllerEvents extends IEvent {
	/**
	 * Emitted when staging mode is entered or exited.
	 *
	 * @param event - The event name: `"stagingModeChanged"`.
	 * @param listener - Called with `true` when staging mode is entered, `false` when exited.
	 *
	 * @eventProperty
	 */
	(event: "stagingModeChanged", listener: (active: boolean) => void): void;
}

/**
 * Provider for {@link IStagingController}.
 *
 * @remarks
 * Implement this interface on objects placed in the container scope (or `HostUXTypes`)
 * so that interested code can retrieve the staging controller via the fluid object provider pattern.
 *
 * @legacy @alpha
 */
export interface IProvideStagingController {
	readonly IStagingController: IStagingController;
}

/**
 * Controller for managing staged changes across the lifetime of a container.
 *
 * @remarks
 * Obtained once at container creation time from the alpha container runtime factory.
 * The holder of this object is the exclusive controller of staging mode —
 * no other code path can enter or exit staging mode.
 *
 * @legacy @alpha
 * @sealed
 */
export interface IStagingController
	extends IProvideStagingController,
		IEventProvider<IStagingControllerEvents> {
	/**
	 * Whether the container is currently in staging mode.
	 */
	readonly inStagingMode: boolean;

	/**
	 * Enter staging mode. While in staging mode, ops are buffered locally
	 * and not sent to the ordering service until
	 * {@link IStagingController.exitStagingMode | exitStagingMode("commit")} is called.
	 *
	 * @throws Will throw if already in staging mode or if the container is detached.
	 */
	enterStagingMode(): void;

	/**
	 * Exit staging mode and either commit or discard the staged changes.
	 *
	 * @param action - `"commit"` sends the buffered ops to the ordering service.
	 * `"discard"` rolls back all changes made while in staging mode.
	 *
	 * @throws Will throw if not currently in staging mode.
	 */
	exitStagingMode(action: "commit" | "discard"): void;
}

/**
 * Converts types to their alpha counterparts to expose alpha functionality.
 * @legacy @alpha
 * @sealed
 */
export function asLegacyAlpha(base: IContainerRuntimeBase): ContainerRuntimeBaseAlpha {
	return base as ContainerRuntimeBaseAlpha;
}

/**
 * Alpha interface for container runtime base supporting staging mode.
 *
 * @legacy @alpha
 * @sealed
 */
export interface ContainerRuntimeBaseAlpha extends IContainerRuntimeBase {
	/**
	 * Indicates whether the container is currently in staging mode.
	 */
	readonly inStagingMode: boolean;
}
