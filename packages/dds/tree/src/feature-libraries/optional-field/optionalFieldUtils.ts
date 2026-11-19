/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId } from "../../core/index.js";
import type { OptionalChangeset } from "./optionalFieldChangeTypes.js";

interface ContextState {
	isEmpty: boolean | undefined;
}

export function getInputContextState(change: OptionalChangeset): ContextState {
	const isEmpty = change.nodeDetach === undefined ? change.valueReplace?.isEmpty : false;
	return { isEmpty };
}

export function getOutputContextState(change: OptionalChangeset): ContextState {
	const isEmpty =
		change.valueReplace?.src === undefined
			? getEffectiveDetachId(change) === undefined
				? change.valueReplace?.isEmpty
				: true
			: false;
	return { isEmpty };
}

export function areContextStatesConsistent(
	state1: ContextState,
	state2: ContextState,
): true | string {
	if ((state1.isEmpty ?? state2.isEmpty) !== (state2.isEmpty ?? state1.isEmpty)) {
		return "Inconsistent field emptiness";
	}
	return true;
}

export function getEffectiveDetachId(change: OptionalChangeset): ChangeAtomId | undefined {
	if (change.nodeDetach !== undefined) {
		return change.nodeDetach;
	}

	return change.valueReplace?.isEmpty === false ? change.valueReplace.dst : undefined;
}
