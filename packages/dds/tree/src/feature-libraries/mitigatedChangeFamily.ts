/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeFamily,
	ChangeFamilyEditor,
	ChangeRebaser,
	RevisionMetadataSource,
	RevisionTag,
	TaggedChange,
} from "../core/index.js";

/**
 * Makes a given `ChangeFamily` safer to use by wrapping some of its functions in try-catch blocks.
 *
 * Mitigated functions:
 * - {@link ChangeFamily.intoDelta} (an empty Delta is returned instead)
 * - {@link ChangeRebaser.rebase} (the given `fallbackChange` is returned instead)
 * - {@link ChangeRebaser.invert} (the given `fallbackChange` is returned instead)
 * - {@link ChangeRebaser.compose} (the given `fallbackChange` is returned instead)
 *
 * @param unmitigatedChangeFamily - The change family to mitigate.
 * @param fallbackChange - A changeset to use as a fallback when one of the mitigated functions throws.
 * @param onError - A callback invoked for each error thrown.
 * @returns a mitigated change family.
 */
export function makeMitigatedChangeFamily<TEditor extends ChangeFamilyEditor, TChange>(
	unmitigatedChangeFamily: ChangeFamily<TEditor, TChange>,
	fallbackChange: TChange,
	onError: (error: unknown) => void,
): ChangeFamily<TEditor, TChange> {
	return {
		buildEditor: (
			mintRevisionTag: () => RevisionTag,
			changeReceiver: (change: TaggedChange<TChange>) => void,
		): TEditor => {
			return unmitigatedChangeFamily.buildEditor(mintRevisionTag, changeReceiver);
		},
		rebaser: makeMitigatedRebaser(unmitigatedChangeFamily.rebaser, fallbackChange, onError),
		codecs: unmitigatedChangeFamily.codecs,
	};
}

export function makeMitigatedRebaser<TChange>(
	unmitigatedRebaser: ChangeRebaser<TChange>,
	fallbackChange: TChange,
	onError: (error: unknown) => void,
): ChangeRebaser<TChange> {
	const withFallback = (fn: () => TChange): TChange => {
		try {
			return fn();
		} catch (error: unknown) {
			onError(error);
			return fallbackChange;
		}
	};

	return {
		compose: (changes: TaggedChange<TChange>[]): TChange => {
			return withFallback(() => unmitigatedRebaser.compose(changes));
		},
		invert: (
			changes: TaggedChange<TChange>,
			isRollback: boolean,
			revision: RevisionTag,
		): TChange => {
			return withFallback(() => unmitigatedRebaser.invert(changes, isRollback, revision));
		},
		rebase: (
			change: TaggedChange<TChange>,
			over: TaggedChange<TChange>,
			revisionMetadata: RevisionMetadataSource,
		): TChange => {
			return withFallback(() => unmitigatedRebaser.rebase(change, over, revisionMetadata));
		},
		changeRevision: (
			change: TChange,
			newRevision: RevisionTag | undefined,
			rollbackOf?: RevisionTag,
		): TChange =>
			withFallback(() => unmitigatedRebaser.changeRevision(change, newRevision, rollbackOf)),
	};
}
