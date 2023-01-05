/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependee, InvalidationToken } from "./dependencies";

/**
 * A custom invalidation protocol to enable 2 phase cleaning, enabling features like output-diff.
 */

/**
 * InvalidationToken type to use for cleanable.
 * Using a subclass of InvalidationToken results in cleanable showing up better in the debugger.
 */
class CleanableToken extends InvalidationToken {}

/**
 * InvalidationToken type to use for cleanable.
 * Using a subclass of InvalidationToken results in cleanable showing up better in the debugger.
 */
class CleaningFailedToken extends InvalidationToken {}

/**
 * `Dependee` might have changed and implements Cleanable.
 * See Cleanable for contract.
 *
 * @internal
 */
export const cleanable: InvalidationToken = new CleanableToken("cleanable", false);

/**
 * `Dependee` previously sent cleanable invalidation, and that cleaning has failed.
 * Unlike normal invalidation, cleaningFailed invalidation can be sent when updating/recomputing a cell.
 *
 * See {@link Cleanable} for contract.
 *
 * @internal
 */
export const cleaningFailed: InvalidationToken = new CleaningFailedToken("cleaningFailed", true);

/**
 * Invalidation protocol extension enabling 2 phase 'cleaning'. See also `cleanable`.
 *
 * When a `cleanable` invalidation is sent
 * it means that a Dependent has the option of deferring invalidation until a later point.
 * If the dependent chooses to do this deferral, it can call tryClean to flush the deferred invalidation.
 *
 * If the Cleanable dependee fails to clean itself, it must call the dependents' markInvalid without a
 * cleanable token sometime between when it send the cleanable invalidation and when tryClean returns.
 * If calling markInvalid in response to tryClean, or when updating a cell, it must have a cleaningFailed token,
 * and must have been preceded by a cleanable invalidation.
 *
 * A dependent that has chosen to defer invalidation and has not yet been either invalidated or called tryClean
 * is described as 'dirty'.
 *
 * A Cleanable dependee that has sent a `cleanable` invalidation is describes as 'awaiting cleaning'.
 * 'awaiting cleaning' ends when the
 * dependee either is confirmed to be clean, or calls markInvalid without a cleanable token on all its dependents
 * (as a response to tryClean or otherwise).
 *
 * @internal
 */
export interface Cleanable extends Dependee {
    /**
     * Guarantees this dependee is not in the 'awaiting cleaning' state, attempting to clean this dependee if necessary.
     * If this cleaning fails (ex: cannot be updated, or updating results in changes),
     * the implementation must call markInvalid with a
     * cleaningFailed token on all dependents.
     *
     * If `tryClean` undefined,
     * this dependee is considered not to be Cleanable and must not send cleanable invalidation:
     * dependents can assume that 'cleanable' invalidation only comes from dependees with a defined tryClean,
     * and thus any dependee without a tryClean is never in the 'awaiting cleaning' state.
     */
    tryClean?(): void;
}
