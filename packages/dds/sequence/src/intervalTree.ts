/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IIntegerRange,
    RBNode,
    IRBAugmentation,
    IRBMatcher,
    RedBlackTree,
    ConflictAction,
    RBNodeActions,
} from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

export interface AugmentedIntervalNode {
    minmax: IInterval;
}

export const integerRangeToString = (range: IIntegerRange) => `[${range.start},${range.end})`;

/**
 * Basic interval abstraction
 */
export interface IInterval {
    /**
     * @returns a new interval object with identical semantics.
     */
    clone(): IInterval;
    /**
     * Compares this interval to `b` with standard comparator semantics:
     * - returns -1 if this is less than `b`
     * - returns 1 if this is greater than `b`
     * - returns 0 if this is equivalent to `b`
     * @param b - Interval to compare against
     */
    compare(b: IInterval): number;
    /**
     * Compares the start endpoint of this interval to `b`'s start endpoint.
     * Standard comparator semantics apply.
     * @param b - Interval to compare against
     */
    compareStart(b: IInterval): number;
    /**
     * Compares the end endpoint of this interval to `b`'s end endpoint.
     * Standard comparator semantics apply.
     * @param b - Interval to compare against
     */
    compareEnd(b: IInterval): number;
    /**
     * Modifies one or more of the endpoints of this interval, returning a new interval representing the result.
     * @internal
     */
    modify(
        label: string,
        start: number | undefined,
        end: number | undefined,
        op?: ISequencedDocumentMessage,
        localSeq?: number
    ): IInterval | undefined;
    /**
     * @returns whether this interval overlaps with `b`.
     * Since intervals are inclusive, this includes cases where endpoints are equal.
     */
    overlaps(b: IInterval): boolean;
    /**
     * Unions this interval with `b`, returning a new interval.
     * The union operates as a convex hull, i.e. if the two intervals are disjoint, the return value includes
     * intermediate values between the two intervals.
     * @internal
     */
    union(b: IInterval): IInterval;
}

const intervalComparer = (a: IInterval, b: IInterval) => a.compare(b);

export type IntervalNode<T extends IInterval> = RBNode<T, AugmentedIntervalNode>;

export type IntervalConflictResolver<TInterval> = (a: TInterval, b: TInterval) => TInterval;

export class IntervalTree<T extends IInterval> implements IRBAugmentation<T, AugmentedIntervalNode>,
    IRBMatcher<T, AugmentedIntervalNode> {
    public intervals = new RedBlackTree<T, AugmentedIntervalNode>(intervalComparer, this);

    public remove(x: T) {
        this.intervals.remove(x);
    }

    public removeExisting(x: T) {
        this.intervals.removeExisting(x);
    }

    public put(x: T, conflict?: IntervalConflictResolver<T>) {
        let rbConflict: ConflictAction<T, AugmentedIntervalNode> | undefined;
        if (conflict) {
            rbConflict = (key: T, currentKey: T) => {
                const ival = conflict(key, currentKey);
                return {
                    key: ival,
                };
            };
        }
        this.intervals.put(x, { minmax: x.clone() }, rbConflict);
    }

    public map(fn: (x: T) => void) {
        const actions: RBNodeActions<T, AugmentedIntervalNode> = {
            infix: (node) => {
                fn(node.key);
                return true;
            },
            showStructure: true,
        };
        this.intervals.walk(actions);
    }

    public mapUntil(fn: (X: T) => boolean) {
        const actions: RBNodeActions<T, AugmentedIntervalNode> = {
            infix: (node) => {
                return fn(node.key);
            },
            showStructure: true,
        };
        this.intervals.walk(actions);
    }

    public mapBackward(fn: (x: T) => void) {
        const actions: RBNodeActions<T, AugmentedIntervalNode> = {
            infix: (node) => {
                fn(node.key);
                return true;
            },
            showStructure: true,
        };
        this.intervals.walkBackward(actions);
    }

    // TODO: toString()
    public match(x: T) {
        return this.intervals.gather(x, this);
    }

    public matchNode(node: IntervalNode<T> | undefined, key: T) {
        return !!node && node.key.overlaps(key);
    }

    public continueSubtree(node: IntervalNode<T> | undefined, key: T) {
        return !!node && node.data.minmax.overlaps(key);
    }

    public update(node: IntervalNode<T>) {
        if (node.left && node.right) {
            node.data.minmax = node.key.union(
                node.left.data.minmax.union(node.right.data.minmax));
        } else {
            if (node.left) {
                node.data.minmax = node.key.union(node.left.data.minmax);
            } else if (node.right) {
                node.data.minmax = node.key.union(node.right.data.minmax);
            } else {
                node.data.minmax = node.key.clone();
            }
        }
    }
}
