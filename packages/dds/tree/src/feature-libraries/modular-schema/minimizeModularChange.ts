/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKindIdentifier } from "../../core/index.js";

import type { FlexFieldKind } from "./fieldKind.js";
import type { ModularChangeset } from "./modularChangeTypes.js";

/**
 * "Minimizes" a {@link ModularChangeset} so that it contains no extraneous
 * information, i.e. no new content that isn't observable from document tree
 * and no edits without net observed effect on the document tree.
 * @remarks
 * "Extraneous information" includes, for example, data for nodes that were both created and removed within the same
 * transaction, or changes whose effects cancel out to nothing. Minimizing reduces the size of an edit without altering
 * its observable effect.
 *
 * This is the eventual home of the minimization algorithm, colocated with {@link ModularChangeFamily} so it can use its
 * internals. It is currently a no-op that returns the change unchanged; a real implementation will be provided in a
 * future change.
 *
 * @param change - The change to minimize.
 * @param fieldKinds - The field kinds to delegate to when computing the change's delta.
 */
export function minimizeModularChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ModularChangeset {
	// TODO: Actually minimize the change. For now this is a no-op that returns the change unchanged.
	return change;
}
