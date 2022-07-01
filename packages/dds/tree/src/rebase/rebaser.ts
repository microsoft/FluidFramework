/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand, Brand, Contravariant, Covariant, Invariant } from "../util";
import { UpPath } from "./pathTree";

/**
 * A way to refer to a particular revision within a given {@link Rebaser} instance.
 */
export type RevisionTag = Brand<number, "rebaser.RevisionTag">;

/**
 * A collection of branches which can rebase changes between them.
 */
export class Rebaser<TChangeRebaser extends ChangeRebaser<any, any, any>> {
    private lastRevision = 0;

    private makeRevision(): RevisionTag {
        this.lastRevision++;
        return brand(this.lastRevision);
    }

    public readonly empty: RevisionTag = brand(0);

    /**
     * All the actual state needed to do the rebases.
     *
     * Source and destination can both walk this to find common ancestor,
     * then rebase across using changes found on walk.
     */
    private readonly branches: Map<RevisionTag, { before: RevisionTag; change: SetFromChangeRebaser<TChangeRebaser>; }>
        = new Map();

    public constructor(public readonly rebaser: TChangeRebaser) {
        // TODO
    }

    /**
     * Rebase `changes` from being applied to the `from` state to able to be applied to the `to` state.
     * @returns a RevisionTag for the state after applying changes to `to`, and the rebased changes themselves.
     */
    public rebase(changes: ChangeFromChangeRebaser<TChangeRebaser>, from: RevisionTag, to: RevisionTag):
        [RevisionTag, FinalFromChangeRebaser<TChangeRebaser>] {
        const initalChangeset: SetFromChangeRebaser<TChangeRebaser> = this.rebaser.import(changes);
        if (from !== to) {
            throw Error("Not implemented"); // TODO: rebase
        }
        const over = this.rebaser.compose([]);
        const finalChangeset: SetFromChangeRebaser<TChangeRebaser> = this.rebaser.rebase(initalChangeset, over);
        const newRevision = this.makeRevision();
        this.branches.set(newRevision, { before: to, change: finalChangeset });
        const output: FinalFromChangeRebaser<TChangeRebaser> = this.rebaser.export(finalChangeset);
        return [newRevision, output];
    }

    /**
     * Informs the Rebaser that `revision` will not be used again,
     * and internal resources related to it may be freed.
     */
    public discardRevision(revision: RevisionTag): void {
        throw Error("Not implemented"); // TODO
    }
}

// TODO: managing the types with these is not working well (inferring any for methods in Rebaser). Do something else.

export type ChangeFromChangeRebaser<TChangeRebaser extends ChangeRebaser<any, any, any>> =
    TChangeRebaser extends ChangeRebaser<infer TChange, any, any> ? TChange : never;

export type FinalFromChangeRebaser<TChangeRebaser extends ChangeRebaser<any, any, any>> =
    TChangeRebaser extends ChangeRebaser<any, infer TFinal, any> ? TFinal : never;

export type SetFromChangeRebaser<TChangeRebaser extends ChangeRebaser<any, any, any>> =
    TChangeRebaser extends ChangeRebaser<any, any, infer TState> ? TState : never;

/**
 * Rebasing logic for a particular kind of change.
 *
 * This interface is designed to be easy to implement.
 * Use {@link Rebaser} for an ergonomic wrapper around this.
 *
 * TODO: more fully document all axioms Rebaser assumes about implementations.
 * Be clear about which of these are required for coherence, and which are desired for good semantics.
 */
export interface ChangeRebaser<TChange, TFinalChange, TChangeSet> {
    _typeCheck?: Covariant<TChange> & Contravariant<TFinalChange> & Invariant<TChangeSet>;

    /**
     * TChangeSet must form a [group](https://en.wikipedia.org/wiki/Group_(mathematics)).
     *
     * Calling compose with [] gives the identity element.
     * This function must use a an associative composition operation to compose all the provided changes.
     *
     * A whole batch of changes is provided at once instead of
     * just a pair to allow the implementation to be more optimized.
     */
    compose(...changes: TChangeSet[]): TChangeSet;

    /**
     * Returns the inverse of `changes`.
     *
     * `compose(changes, inverse(changes))` must return compose().
     */
    invert(changes: TChangeSet): TChangeSet;

    rebase(change: TChangeSet, over: TChangeSet): TChangeSet;

    import(change: TChange): TChangeSet;

    export(change: TChangeSet): TFinalChange;
}

export interface FinalChange {
    readonly status: FinalChangeStatus;
}

export enum FinalChangeStatus {
    conflicted,
    rebased,
    commuted,
}

export interface AnchorLocator<TAnchor> {
    /**
     * TODO: support extra/custom return types for specific anchor types:
     * for now caller must rely on dat in anchor + returned node location
     * (not ideal for anchors for places or ranges instead of nodes).
     */
    locate(anchor: TAnchor): UpPath;

    forget(anchor: TAnchor): void;

    /**
     * TODO: add API to UpPath (maybe extend as AnchorPath to allow building without having to copy here?)
     */
    track(path: UpPath): TAnchor;
}
