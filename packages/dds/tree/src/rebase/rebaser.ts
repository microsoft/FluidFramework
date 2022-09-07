/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand, Brand, Invariant } from "../util";
import { AnchorSet } from "../tree";

/**
 * A way to refer to a particular revision within a given {@link Rebaser} instance.
 */
export type RevisionTag = Brand<number, "rebaser.RevisionTag">;

/**
 * A collection of branches which can rebase changes between them.
 *
 * @sealed
 */
export class Rebaser<TChangeRebaser extends ChangeRebaser<any>> {
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
    private readonly revisionTree: Map<
        RevisionTag,
        { before: RevisionTag; change: ChangesetFromChangeRebaser<TChangeRebaser>; }
    > = new Map();

    public constructor(public readonly rebaser: TChangeRebaser) {
        // TODO
    }

    /**
     * Rebase `changes` from being applied to the `from` state to able to be applied to the `to` state.
     * @returns a RevisionTag for the state after applying changes to `to`, and the rebased changes themselves.
     */
    public rebase(
        changes: ChangesetFromChangeRebaser<TChangeRebaser>,
        from: RevisionTag,
        to: RevisionTag,
    ): [RevisionTag, ChangesetFromChangeRebaser<TChangeRebaser>] {
        const over = this.getResolutionPath(from, to);
        const finalChangeset: ChangesetFromChangeRebaser<TChangeRebaser> =
            this.rebaser.rebase(changes, over);
        const newRevision = this.makeRevision();
        this.revisionTree.set(newRevision, {
            before: to,
            change: finalChangeset,
        });
        return [newRevision, finalChangeset];
    }

    /**
     * Modifies `anchors` to be valid at the destination.
     */
    public rebaseAnchors(
        anchors: AnchorSet,
        from: RevisionTag,
        to: RevisionTag,
    ): void {
        const over = this.getResolutionPath(from, to);
        this.rebaser.rebaseAnchors(anchors, over);
    }

    // Separated out for easier testing
    private getRawResolutionPath(
        from: RevisionTag,
        to: RevisionTag,
    ): ChangesetFromChangeRebaser<TChangeRebaser>[] {
        if (from !== to) {
            throw Error("Not implemented"); // TODO: rebase
        }
        return [];
    }

    public getResolutionPath(
        from: RevisionTag,
        to: RevisionTag,
    ): ChangesetFromChangeRebaser<TChangeRebaser> {
        // TODO: fix typing
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.rebaser.compose(this.getRawResolutionPath(from, to));
    }

    /**
     * Informs the Rebaser that `revision` will not be used again,
     * and internal resources related to it may be freed.
     */
    public discardRevision(revision: RevisionTag): void {
        throw Error("Not implemented"); // TODO
    }
}

// TODO: managing the types with this is not working well (inferring any for methods in Rebaser). Do something else.
export type ChangesetFromChangeRebaser<
    TChangeRebaser extends ChangeRebaser<any>,
    > = TChangeRebaser extends ChangeRebaser<infer TChangeset>
    ? TChangeset
    : never;

/**
 * Rebasing logic for a particular kind of change.
 *
 * This interface is designed to be easy to implement.
 * Use {@link Rebaser} for an ergonomic wrapper around this.
 *
 * The implementation must ensure TChangeset forms a [group](https://en.wikipedia.org/wiki/Group_(mathematics)) where:
 * - `compose([])` is the identity element.
 * - associativity is defined as `compose([...a, ...b])` is equal to
 * `compose([compose(a), compose(b)])` for all `a` and `b`.
 * - `inverse(a)` gives the inverse element of `a`.
 *
 * In these requirements the definition of equality is up to the implementer,
 * but it is required that any two changes which are considered equal:
 * - have the same impact when applied to any tree.
 * - can be substituted for each-other in all methods on this
 * interface and produce equal (by this same definition) results.
 *
 * For the sake of testability, implementations will likely want to have a concrete equality implementation.
 *
 * This API uses `compose` on arrays instead of an explicit identity element and associative binary operator
 * to allow the implementation more room for optimization,
 * but should otherwise be equivalent to the identity element and binary operator group approach.
 *
 * TODO:
 * Be more specific about the above requirements.
 * For example, would something that is close to forming a group but has precision issues
 * (ex: the floating point numbers and addition) be ok?
 * Would this cause decoherence (and thus be absolutely not ok),
 * or just minor semantic precision issues, which could be tolerated.
 * For now assume that such issues are not ok.
 */
export interface ChangeRebaser<TChangeset> {
    _typeCheck?: Invariant<TChangeset>;

    /**
     * Compose a collection of changesets into a single one.
     * See {@link ChangeRebaser} for requirements.
     */
    compose(changes: TChangeset[]): TChangeset;

    /**
     * @returns the inverse of `changes`.
     *
     * `compose([changes, inverse(changes)])` be equal to `compose([])`:
     * See {@link ChangeRebaser} for details.
     */
    invert(changes: TChangeset): TChangeset;

    /**
     * Rebase `change` over `over`.
     *
     * The resulting changeset should, as much as possible, replicate the same semantics as `change`,
     * except be valid to apply after `over` instead of before it.
     *
     * Requirements:
     * The implementation must ensure that for all possible changesets `a`, `b` and `c`:
     * - `rebase(a, compose([b, c])` is equal to `rebase(rebase(a, b), c)`.
     * - `rebase(compose([a, b]), c)` is equal to
     * `compose([rebase(a, c), rebase(b, compose([inverse(a), c, rebase(a, c)])])`.
     * - `rebase(a, compose([]))` is equal to `a`.
     * - `rebase(compose([]), a)` is equal to `a`.
     */
    rebase(change: TChangeset, over: TChangeset): TChangeset;

    // TODO: we are forcing a single AnchorSet implementation, but also making ChangeRebaser deal depend on/use it.
    // This isn't ideal, but it might be fine?
    // Performance and implications for custom Anchor types (ex: Place anchors) aren't clear.
    rebaseAnchors(anchors: AnchorSet, over: TChangeset): void;
}

export interface FinalChange {
    readonly status: FinalChangeStatus;
}

export enum FinalChangeStatus {
    conflicted,
    rebased,
    commuted,
}
