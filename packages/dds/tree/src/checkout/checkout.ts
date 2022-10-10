/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IForestSubscription } from "../forest";

export interface ICheckout<TEditBuilder> {
    /**
     * Current contents.
     * Updated by edits (local and remote).
     * Use `runTransaction` to create a local edit.
     */
    readonly forest: IForestSubscription;

    /**
     * Run `transaction` to edit this forest.
     * While `transaction` is running, its intermediate states will be visible on the IForestSubscription.
     *
     * TODO: provide ways to run transactions separate from checkout, to allow async (with rebase) transactions,
     * and concurrent transactions.
     * TODO: support nesting (perhaps via "commands"),
     * and do this in a way where there is control over which ones intermediate versions are displayed.
     */
    runTransaction(
        transaction: (forest: IForestSubscription, editor: TEditBuilder) => TransactionResult,
    ): TransactionResult;
}

export enum TransactionResult {
    Abort,
    Apply,
}
