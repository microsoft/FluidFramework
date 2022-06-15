/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependent, Dependee } from "./dependencies";

/**
 * This file provides a notion of units of incremental computations which can observe each-other.
 */

/**
 * State/Environment for a computation which can observe {@link Dependees}.
 */
export interface ObservingContext {
	/**
	 * The computation which is running in this context.
	 * When this computation observes a {@link Dependee}, it should be recorded here via {@link recordDependency}.
	 *
	 * This dependency tracking allows these dependees to invalidate this dependent in the future via
     * {@link Dependant.markInvalid}.
	 *
	 * It not provided, this observer does not need dependency tracking.
	 */
	readonly dependent: ObservingDependent | undefined;
}

/**
 * Ensures this context's computation is a dependant to dependee (adding it if needed).
 * Ensures this context's computation has dependee as a dependee (adding it if needed).
 */
export function recordDependency(dependent: ObservingDependent | undefined, dependee: Dependee): void {
	if (dependent) {
		if (dependee.registerDependent(dependent)) {
			dependent.registerDependee(dependee);
		}
	}
}

/**
 * A dependent which can have observations it makes recorded onto it.
 */
export interface ObservingDependent extends Dependent {
	/**
	 * Records that dependee has just had this added as a dependent via {@link Dependee.registerDependent}.
	 * Use {@link recordDependency} to perform both sides of the recording together.
	 */
	registerDependee(dependee: Dependee): void;

	/**
	 * {@inheritdoc Dependent.listDependees}
     *
     * @override
	 */
    // Since it is almost to implement registerDependee correctly without being able to list dependees
    // (so they can be unregistered), make this required instead of optional.
	listDependees(): Iterable<Dependee>;
}
