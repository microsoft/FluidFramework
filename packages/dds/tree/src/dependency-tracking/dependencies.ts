/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MakeNominal } from "../util";

/**
 * This file contains the core invalidation / dependency tracking types.
 */

/**
 * Computation, with a name.
 *
 * @public
 */
export interface NamedComputation {
	/**
	 * A developer-friendly description of the computation this Cell represents.
	 * Typically a function name: should be a constant which can be located by searching the source.
	 * This name should not be relied on for semantic purposes, and should must be safe to log.
	 * Use when measuring / debugging / logging computation costs, invalidation etc.
	 */
	readonly computationName: string;

    /**
     * Lists the currently subscribed set of Dependees.
     * This is exposed to allow tooling to inspect the dependency graph,
     * and should not be needed for regular functionality.
     */
    listDependees?(): Iterable<Dependee>;

    /**
     * Lists the currently subscribed set of Dependent.
     * This is exposed to allow tooling to inspect the dependency graph,
     * and should not be needed for regular functionality.
     */
    listDependents?(): Iterable<Dependent>;
}

/**
 * Object that can depend on {@link Dependee}s.
 *
 * Provides a callback ({@link Dependent.markInvalid}) for the `Dependee` to invoke when it is invalidated.
 *
 * @public
 */
export interface Dependent extends NamedComputation {
	/**
	 * Invalidates the `Dependent`.
	 *
	 * This is typically called by a {@link Dependee} this `Dependent` registered its dependance on
	 * (via {@link Dependee.registerDependent}) when the dependee is invalidated.
	 * This is how invalidation propagates to the dependance graph along Dependee-to-Dependent edges.
	 *
	 * @param token - Optional extra information about the invalidation.
	 * Can be used to support less conservative invalidation as an optimization.
     * A Dependent may ignore this and have correct invalidation.
	 * If reducing invalidation based on the token,
     * there will be a token specific invalidation protocol that must be obeyed.
	 */
	markInvalid(token?: InvalidationToken): void;
}

/**
 * Type for providing optional extra data to {@link Dependent.markInvalid}.
 * Particular instances and/or subclasses can be used to indicate invalidations
 * that can optionally be handled less conservatively than the base invalidated case.
 *
 * @public
 */
export class InvalidationToken {
	protected readonly _typeCheck!: MakeNominal;

	/**
	 * @param description - Shows in debugger to help identify tokens.
	 * @param isSecondaryInvalidation - True iff the invalidation with this token only provides information
     * about other invalidation,
	 * and thus, if otherwise ignoring tokens, this invalidation can be ignored.
	 */
	public constructor(public readonly description: string, public readonly isSecondaryInvalidation = false) {}
}

/**
 * Interface for object which can change and invalidate {@link Dependent}s when changing.
 * Tracks a set of `Dependent`s on which {@link Dependent.markInvalid} will be called when the output of this changes.
 *
 * Dependencies are only used for invalidation,
 * so there is no need to make a `Dependee` when the source data is immutable.
 *
 * @public
 */
export interface Dependee extends NamedComputation {
	/**
	 * Registers a new dependent. Makes the `dependent` depend on this dependee.
	 *
	 * @param dependent - The dependent which should have its markInvalid called if the output of this changes.
	 * @returns true iff dependent was added (false if it was already tracked or otherwise not needed to be added).
	 * If true is returned, a removeDependent can be performed to remove dependent.
	 */
	registerDependent(dependent: Dependent): boolean;

	/**
	 * Removes a dependent which was previously added by a call to registerDependent which returned true.
	 * This causes dependent's markInvalid to no longer get called when this dependee is invalidated.
	 *
	 * @param dependent - The dependent that no longer depends on this.
	 */
	removeDependent(dependent: Dependent): void;
}
