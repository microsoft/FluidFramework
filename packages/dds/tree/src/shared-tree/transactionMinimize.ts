/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeProcessorApplicability } from "../shared-tree-core/index.js";
import type { TransactionPostProcessor } from "../simple-tree/index.js";

import { minimizeModularChangeset } from "../feature-libraries/index.js";

import { mapDataChanges } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { createTransactionPostProcessor } from "./transactionPostProcessor.js";

/**
 * "Minimizes" a {@link SharedTreeChange} so that it contains no extraneous
 * information, i.e. no data that has no net effect on the document.
 *
 * @remarks
 * This iterates over the change's constituent {@link ModularChangeset}s,
 * replacing each with its {@link minimizeModularChangeset | minimized} form.
 * Schema changes are left unchanged.
 */
function minimizeSharedTreeChange(change: SharedTreeChange): SharedTreeChange {
	return mapDataChanges(change, (innerChange) => minimizeModularChangeset(innerChange));
}

/**
 * A {@link TransactionPostProcessor | post-processor} that "minimizes" the change
 * produced when a transaction is committed, so that the resulting squashed change
 * contains no extraneous information.
 *
 * @remarks
 * Supply this via {@link RunTransactionParams.postProcessor} when {@link RunTransaction | running a transaction}.
 * "Extraneous information" includes, for example, data for nodes that were both
 * created and removed within the transaction, or changes whose effects cancel
 * out to nothing. Minimizing the change reduces the size of the edit that is
 * submitted to (and stored by) the service without altering the observable
 * effect of the transaction.
 *
 * @deprecated Note: minimization is not yet implemented. For now this is a
 * no-op that leaves the squashed change unchanged, so supplying it currently
 * has no observable effect beyond reserving the behavior. A real
 * implementation will be provided in a future change.
 *
 * @alpha
 */
export const minimize: TransactionPostProcessor = createTransactionPostProcessor({
	applicability: ChangeProcessorApplicability.IfOutermost,
	processChange: minimizeSharedTreeChange,
});
