/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ChangeFamily,
	SessionId,
	ChangeRebaser,
	ChangeFamilyEditor,
	mintRevisionTag,
} from "../../core";
import { TestChangeFamily, TestChange, testChangeFamilyFactory } from "../testChange";
import { Commit, EditManager } from "../../shared-tree-core";
import { brand, makeArray } from "../../util";

export type TestEditManager = EditManager<ChangeFamilyEditor, TestChange, TestChangeFamily>;

export function testChangeEditManagerFactory(options: {
	rebaser?: ChangeRebaser<TestChange>;
	sessionId?: SessionId;
	autoDiscardRevertibles?: boolean;
}): {
	manager: TestEditManager;
	family: ChangeFamily<ChangeFamilyEditor, TestChange>;
} {
	const family = testChangeFamilyFactory(options.rebaser);
	const manager = editManagerFactory(family, {
		sessionId: options.sessionId,
		autoDiscardRevertibles: options.autoDiscardRevertibles,
	});

	return { manager, family };
}

export function editManagerFactory<TChange = TestChange>(
	family: ChangeFamily<any, TChange>,
	options: {
		sessionId?: SessionId;
		autoDiscardRevertibles?: boolean;
	} = {},
): EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>> {
	const autoDiscardRevertibles = options.autoDiscardRevertibles ?? true;
	const manager = new EditManager<
		ChangeFamilyEditor,
		TChange,
		ChangeFamily<ChangeFamilyEditor, TChange>
	>(family, options.sessionId ?? "0");

	if (autoDiscardRevertibles === true) {
		// by default, discard revertibles in the edit manager tests
		manager.localBranch.on("revertible", (revertible) => {
			revertible.discard();
		});
	}
	return manager;
}

export function rebaseLocalEditsOverTrunkEdits<TChange>(
	localEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
): void;
export function rebaseLocalEditsOverTrunkEdits<TChange>(
	localEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: true,
): () => void;
export function rebaseLocalEditsOverTrunkEdits<TChange>(
	localEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: boolean = false,
): void | (() => void) {
	// Subscribe to the local branch to emulate the behavior of SharedTree
	manager.localBranch.on("afterChange", ({ change }) => {});
	for (let iChange = 0; iChange < localEditCount; iChange++) {
		manager.localBranch.apply(mintChange(), mintRevisionTag());
	}
	const trunkEdits = makeArray(trunkEditCount, () => ({
		change: mintChange(),
		revision: mintRevisionTag(),
		sessionId: "trunk",
	}));
	const run = () => {
		for (let iChange = 0; iChange < trunkEditCount; iChange++) {
			manager.addSequencedChange(trunkEdits[iChange], brand(iChange + 1), brand(iChange));
		}
	};
	return defer ? run : run();
}

export function rebasePeerEditsOverTrunkEdits<TChange>(
	peerEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
): void;
export function rebasePeerEditsOverTrunkEdits<TChange>(
	peerEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: true,
): () => void;
export function rebasePeerEditsOverTrunkEdits<TChange>(
	peerEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: boolean = false,
): void | (() => void) {
	// Subscribe to the local branch to emulate the behavior of SharedTree
	manager.localBranch.on("afterChange", ({ change }) => {});
	for (let iChange = 0; iChange < trunkEditCount; iChange++) {
		manager.addSequencedChange(
			{
				change: mintChange(),
				revision: mintRevisionTag(),
				sessionId: "trunk",
			},
			brand(iChange + 1),
			brand(iChange),
		);
	}
	const peerEdits = makeArray(peerEditCount, () => ({
		change: mintChange(),
		revision: mintRevisionTag(),
		sessionId: "peer",
	}));
	const run = () => {
		for (let iChange = 0; iChange < peerEditCount; iChange++) {
			manager.addSequencedChange(
				peerEdits[iChange],
				brand(iChange + trunkEditCount + 1),
				brand(0),
			);
		}
	};
	return defer ? run : run();
}

/**
 * Establishes the following branching structure:
 * ```text
 * (0)-(T1)-...-(Tc-1)-(Tc)
 *  |    |          └-----------------(Pc)
 *  |    └-----------------------(P2)
 *  └-----------------------(P1)
 * ```
 */
export function rebaseAdvancingPeerEditsOverTrunkEdits<TChange>(
	editCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
): void;
export function rebaseAdvancingPeerEditsOverTrunkEdits<TChange>(
	editCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: true,
): () => void;
export function rebaseAdvancingPeerEditsOverTrunkEdits<TChange>(
	editCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: boolean = false,
): void | (() => void) {
	// Subscribe to the local branch to emulate the behavior of SharedTree
	manager.localBranch.on("afterChange", ({ change }) => {});
	for (let iChange = 0; iChange < editCount; iChange++) {
		manager.addSequencedChange(
			{
				change: mintChange(),
				revision: mintRevisionTag(),
				sessionId: "trunk",
			},
			brand(iChange + 1),
			brand(iChange),
		);
	}
	const peerEdits = makeArray(editCount, () => ({
		change: mintChange(),
		revision: mintRevisionTag(),
		sessionId: "peer",
	}));
	const run = () => {
		for (let iChange = 0; iChange < editCount; iChange++) {
			manager.addSequencedChange(
				peerEdits[iChange],
				brand(iChange + editCount + 1),
				brand(iChange),
			);
		}
	};
	return defer ? run : run();
}

export function rebaseConcurrentPeerEdits<TChange>(
	peerCount: number,
	editsPerPeerCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: true,
): () => void;
export function rebaseConcurrentPeerEdits<TChange>(
	peerCount: number,
	editsPerPeerCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
): void;
export function rebaseConcurrentPeerEdits<TChange>(
	peerCount: number,
	editsPerPeerCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
	defer: boolean = false,
): void | (() => void) {
	// Subscribe to the local branch to emulate the behavior of SharedTree
	manager.localBranch.on("afterChange", ({ change }) => {});
	const peerEdits: Commit<TChange>[] = [];
	for (let iChange = 0; iChange < editsPerPeerCount; iChange++) {
		for (let iPeer = 0; iPeer < peerCount; iPeer++) {
			peerEdits.push({
				change: mintChange(),
				revision: mintRevisionTag(),
				sessionId: `p${iPeer}`,
			});
		}
	}
	const run = () => {
		for (let iChange = 0; iChange < peerEdits.length; iChange++) {
			manager.addSequencedChange(peerEdits[iChange], brand(iChange + 1), brand(0));
		}
	};
	return defer ? run : run();
}
