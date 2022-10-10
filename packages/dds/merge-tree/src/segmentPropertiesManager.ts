/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

 /* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/common-utils";
import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants";
import { ICombiningOp, IMergeTreeAnnotateMsg } from "./ops";
import {
    combine,
    createMap,
    MapLike,
    PropertySet,
} from "./properties";

export enum PropertiesRollback {
    /** Not in a rollback */
    None,

    /** Rollback */
    Rollback,

    /** Rollback of a rewrite */
    Rewrite,
}

export class PropertiesManager {
    private pendingKeyUpdateCount: MapLike<number> | undefined;
    private pendingRewriteCount: number;

    constructor() {
        this.pendingRewriteCount = 0;
    }

    public ackPendingProperties(annotateOp: IMergeTreeAnnotateMsg) {
        const rewrite = !!annotateOp.combiningOp && annotateOp.combiningOp.name === "rewrite";
        this.decrementPendingCounts(rewrite, annotateOp.props);
    }

    private decrementPendingCounts(rewrite: boolean, props: PropertySet) {
        if (rewrite) {
            this.pendingRewriteCount--;
        }
        for (const key of Object.keys(props)) {
            if (this.pendingKeyUpdateCount?.[key] !== undefined) {
                if (rewrite && props[key] === null) {
                    // We don't track the pending count for this redundant case
                    continue;
                }
                assert(this.pendingKeyUpdateCount[key] > 0,
                    0x05c /* "Trying to update more annotate props than do exist!" */);
                this.pendingKeyUpdateCount[key]--;
                if (this.pendingKeyUpdateCount?.[key] === 0) {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete this.pendingKeyUpdateCount[key];
                }
            }
        }
    }

    public addProperties(
        oldProps: PropertySet,
        newProps: PropertySet,
        op?: ICombiningOp,
        seq?: number,
        collaborating: boolean = false,
        rollback: PropertiesRollback = PropertiesRollback.None): PropertySet | undefined {
        if (!this.pendingKeyUpdateCount) {
            this.pendingKeyUpdateCount = createMap<number>();
        }

        // There are outstanding local rewrites, so block all non-local changes
        if (this.pendingRewriteCount > 0 && seq !== UnassignedSequenceNumber && seq !== UniversalSequenceNumber
            && collaborating) {
            return undefined;
        }

        // Clean up counts for rolled back edits before modifying oldProps
        if (collaborating) {
            if (rollback === PropertiesRollback.Rollback) {
                this.decrementPendingCounts(false, newProps);
            } else if (rollback === PropertiesRollback.Rewrite) {
                // oldProps is the correct props for tracking counts on rewrite because the ones in newProps include
                // those that were implicitly cleared by the rewrite for which we don't track pending counts.
                this.decrementPendingCounts(true, oldProps);
            }
        }

        const rewrite = (op && op.name === "rewrite");
        const combiningOp = !rewrite ? op ? op : undefined : undefined;

        const shouldModifyKey = (key: string): boolean => {
            if (seq === UnassignedSequenceNumber
                || seq === UniversalSequenceNumber
                || this.pendingKeyUpdateCount?.[key] === undefined
                || combiningOp) {
                return true;
            }
            return false;
        };

        const deltas: PropertySet = {};
        if (rewrite) {
            if (collaborating && seq === UnassignedSequenceNumber) {
                this.pendingRewriteCount++;
            }
            // We are re-writing so delete all the properties
            // not in the new props
            for (const key of Object.keys(oldProps)) {
                if (!newProps[key] && shouldModifyKey(key)) {
                    deltas[key] = oldProps[key];

                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete oldProps[key];
                }
            }
        }

        for (const key of Object.keys(newProps)) {
            if (collaborating) {
                if (seq === UnassignedSequenceNumber) {
                    if (rewrite && newProps[key] === null) {
                        // This case has already been handled above and
                        // we don't want to track the pending count for it in case of rollback
                        continue;
                    }
                    if (this.pendingKeyUpdateCount?.[key] === undefined) {
                        this.pendingKeyUpdateCount[key] = 0;
                    }
                    this.pendingKeyUpdateCount[key]++;
                } else if (!shouldModifyKey(key)) {
                    continue;
                }
            }

            const previousValue: any = oldProps[key];
            // The delta should be null if undefined, as that's how we encode delete
            deltas[key] = (previousValue === undefined) ? null : previousValue;
            const newValue = combiningOp ? combine(combiningOp, previousValue, undefined, seq) : newProps[key];
            if (newValue === null) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete oldProps[key];
            } else {
                oldProps[key] = newValue;
            }
        }

        return deltas;
    }

    public copyTo(
        oldProps: PropertySet,
        newProps: PropertySet | undefined,
        newManager: PropertiesManager,
    ): PropertySet | undefined {
        if (oldProps) {
            if (!newProps) {
                // eslint-disable-next-line no-param-reassign
                newProps = createMap<any>();
            }
            if (!newManager) {
                throw new Error("Must provide new PropertyManager");
            }
            for (const key of Object.keys(oldProps)) {
                newProps[key] = oldProps[key];
            }
            newManager.pendingRewriteCount = this.pendingRewriteCount;
            newManager.pendingKeyUpdateCount = createMap<number>();
            for (const key of Object.keys(this.pendingKeyUpdateCount!)) {
                newManager.pendingKeyUpdateCount[key] = this.pendingKeyUpdateCount![key];
            }
        }
        return newProps;
    }

    public hasPendingProperties() {
        return this.pendingRewriteCount > 0 || Object.keys(this.pendingKeyUpdateCount!).length > 0;
    }
}
