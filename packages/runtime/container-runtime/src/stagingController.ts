/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	CommitStagedChangesOptionsInternal,
	IStagingController,
} from "@fluidframework/runtime-definitions/internal";

/**
 * Implementation of {@link IStagingController} that delegates to closures
 * provided at construction time (bound to the container runtime's private staging methods).
 *
 * This object is created once at container load time and is the exclusive controller
 * of staging mode for the container's lifetime.
 */
export class StagingController implements IStagingController {
	private _inStagingMode: boolean = false;

	public get IStagingController(): IStagingController {
		return this;
	}

	public get inStagingMode(): boolean {
		return this._inStagingMode;
	}

	public constructor(
		private readonly enter: () => void,
		private readonly exit: (
			action: "commit" | "discard",
			options?: Partial<CommitStagedChangesOptionsInternal>,
		) => void,
	) {}

	public enterStagingMode(): void {
		this.enter();
		this._inStagingMode = true;
	}

	/**
	 * Exit staging mode and either commit or discard the staged changes.
	 *
	 * @param action - `"commit"` sends the buffered ops to the ordering service.
	 * `"discard"` rolls back all changes made while in staging mode.
	 * @param options - Options for the exit action (only applicable to `"commit"`).
	 * Note: This parameter is not part of the {@link IStagingController} interface
	 * since the options type is `@internal`. It's available in internal code that
	 * references `StagingController` directly.
	 */
	public exitStagingMode(
		action: "commit" | "discard",
		options?: Partial<CommitStagedChangesOptionsInternal>,
	): void {
		this.exit(action, options);
		this._inStagingMode = false;
	}
}
