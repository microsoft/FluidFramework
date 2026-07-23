/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { fieldKinds, minimizeModularChangeset } from "../feature-libraries/index.js";
import { ChangeProcessorApplicability } from "../shared-tree-core/index.js";
import type { TransactionPostProcessor } from "../simple-tree/index.js";

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
 * At most one data change is allowed in the change currently as a limitation
 * of the minimization implementation, so this function throws a UsageError
 * if more than one data change is present.
 *
 * Schema changes are left unchanged.
 */
function minimizeSharedTreeChange(change: SharedTreeChange): SharedTreeChange {
	const countOfDataChanges = change.changes.filter(
		(innerChange) => innerChange.type === "data",
	).length;
	if (countOfDataChanges > 1) {
		throw new UsageError(
			`At most one edit group can be minimized, but ${countOfDataChanges} were found. To workaround this limitation, pair at most one content edit with any schema changes.`,
		);
	}
	return mapDataChanges(change, (dataChange) =>
		minimizeModularChangeset(dataChange, fieldKinds),
	);
}

/**
 * A {@link TransactionPostProcessor | post-processor} that "minimizes" the change
 * produced when a transaction is committed, so that the resulting squashed change
 * contains no extraneous information.
 *
 * @remarks
 * Supply this via {@link RunTransactionParamsAlpha.postProcessor} when {@link RunTransaction | running a transaction}.
 * "Extraneous information" includes, for example, data for nodes that were both
 * created and removed within the transaction, or changes whose effects cancel
 * out to nothing. Minimizing the change reduces the size of the edit that is
 * submitted to (and stored by) the service without altering the observable
 * effect of the transaction.
 *
 * The current implementation is limited and is unable to guarantee that the
 * resulting change is fully minimized if multiple distinct edit groups are
 * present in the transaction. Transaction edit groups are divided by schema
 * changes, so this limitation is only relevant for transactions that contain
 * one or more schema changes and content edits on both sides. In such cases,
 * the implementation will throw a usage error:
 * "At most one edit group can be minimized..."
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
