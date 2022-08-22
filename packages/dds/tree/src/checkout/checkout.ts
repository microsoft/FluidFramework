/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IForestSubscription, IEditableForest } from "../forest";

// TODO: this whole module is very unfinished.

export interface ICheckout extends IForestSubscription {
    /**
     * Run `transaction` to edit this forest.
     * While `transaction` is running, its intermediate states will be visible on the IForestSubscription.
     *
     * TODO: provide ways to run transactions separate from checkout, to allow async (with rebase) transactions,
     * and concurrent transactions.
     * TODO: support nesting (perhaps via "commands"),
     * and do this in a way where there is control over which ones intermediate versions are displayed.
     */
    runTransaction<T>(transaction: (forest: IEditableForest) => T): T;
}
