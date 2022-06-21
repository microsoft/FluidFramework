/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Dependee, Dependent } from "./dependencies";

enum State {
	Initializing,
	Initialized,
	Disposed,
}

/**
 * A {@link Dependee} which runs a callback once it removes its last dependent.
 * See {@link DisposingDependee.endInitialization}.
 *
 * @public
 */
export class DisposingDependee implements Dependee {
	private readonly dependents = new Set<Dependent>();
	private state = State.Initializing;

	/**
	 * Called on dispose.
	 * Only set while state is State.Initialized.
	 */
	private onDispose: ((dependee: DisposingDependee) => void) | undefined;

	/**
	 * Constructs a DisposingDependee in "initialization mode".
	 * After adding any initial dependencies,
	 * {@link DisposingDependee.endInitialization} can be called to provide an onDispose callback.
	 */
	public constructor(public readonly computationName: string) {}

	public registerDependent(dependent: Dependent): boolean {
		assert(this.state !== State.Disposed, 0x305 /* registerDependent on disposed Dependee */);
		if (this.dependents.has(dependent)) {
			return false;
		}

		this.dependents.add(dependent);
		return true;
	}

	public removeDependent(dependent: Dependent): void {
		this.dependents.delete(dependent);

		if (this.state === State.Initialized) {
			this.disposeIfEmpty();
		}
	}

	public invalidateDependents(): void {
		assert(this.state !== State.Disposed, 0x306 /* invalidateDependents on disposed Dependee */);
		for (const dependent of this.dependents) {
			dependent.markInvalid();
		}
	}

	/**
	 * Ends "initialization mode", meaning this will now be disposed (and thus run the `onDispose` callback)
	 * the next time it has zero dependents (which will be before this returns if it currently has zero dependents).
	 *
	 * Note that once there are zero dependents (before running the `onDispose` callback),
     * this object is no longer usable as a Dependee,
	 * and thus it is an error to call `registerDependent`.
	 * This means `onDispose` will be invoked at most once.
	 *
	 * It is an error to call `endInitialization` more than once.
	 * If called, it should be called by the creator of this DisposingDependee after adding initial dependencies.
	 *
	 * "initialization mode" exists to handle a couple of edge cases where the simpler approach of just
	 * disposing when last dependee is removed would not work:
	 * - No dependents were added in initialization: would never get disposed.
	 * - A dependent was added, then removed, then a second one added during initialization:
	 * the second dependent would be added after this was disposed, which is invalid.
	 *
	 * This first case is actually pretty easy to hit on accident even in a lazy system,
	 * since sometimes the context which takes the dependency does not need dependency tracking
	 * (ex: its a one time event and not a projection).
	 * This scenario is the main motivating factor behind this particular API design.
	 *
	 * Another way to think about this is "initialization mode" effectively holds an extra ref count to this Dependee,
	 * keeping it alive while its in-scope for its creator to add dependents to.
	 *
	 * @param onDispose - run once there are no dependents.
	 * Will be during this call to endInitialization if there are currently no dependents.
	 */
	public endInitialization(onDispose: (dependee: DisposingDependee) => void): void {
		assert(
			this.state === State.Initializing,
			0x307 /* endInitialization should be called exactly once */,
		);
		this.onDispose = onDispose;
		this.state = State.Initialized;
		this.disposeIfEmpty();
	}

	/**
	 * Dispose if there are no dependents.
	 */
	private disposeIfEmpty(): void {
		if (this.dependents.size === 0) {
			assert(this.onDispose !== undefined, 0x308 /* onDispose should be set when disposing */);
			// Set the state to disposed before running the callback
			// to detect cases where the callback adds a dependency (which is invalid).
			this.state = State.Disposed;
			this.onDispose(this);
			// Clearing onDispose is not required,
            // but it ensures a bug can't result in it running twice (will instead error) and
			// reduces the possibility for memory retention from disposed dependees
			// since the call back might close over significant state.
			this.onDispose = undefined;
		}
	}

	/**
	 * @returns true iff this is disposed, and this can no longer be used.
	 */
	public isDisposed(): boolean {
		return this.state === State.Disposed;
	}
}
