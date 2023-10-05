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
import {
	TestChangeFamily,
	TestChange,
	testChangeFamilyFactory,
	TestChangeRebaser,
} from "../testChange";
import { MockRepairDataStoreProvider } from "../utils";
import { Commit, EditManager } from "../../shared-tree-core";
import { brand, makeArray } from "../../util";

export type TestEditManager = EditManager<ChangeFamilyEditor, TestChange, TestChangeFamily>;

export function editManagerFactory(options: {
	rebaser?: ChangeRebaser<TestChange>;
	sessionId?: SessionId;
}): {
	manager: TestEditManager;
	family: ChangeFamily<ChangeFamilyEditor, TestChange>;
} {
	const family = testChangeFamilyFactory(options.rebaser);
	const manager = new EditManager<
		ChangeFamilyEditor,
		TestChange,
		ChangeFamily<ChangeFamilyEditor, TestChange>
	>(family, options.sessionId ?? "0", new MockRepairDataStoreProvider());
	return { manager, family };
}

export function rebaseLocalEditsOverTrunkEdits(
	localEditCount: number,
	trunkEditCount: number,
	rebaser: TestChangeRebaser,
): void;
export function rebaseLocalEditsOverTrunkEdits(
	localEditCount: number,
	trunkEditCount: number,
	rebaser: TestChangeRebaser,
	defer: true,
): () => void;
export function rebaseLocalEditsOverTrunkEdits(
	localEditCount: number,
	trunkEditCount: number,
	rebaser: TestChangeRebaser,
	defer: boolean = false,
): void | (() => void) {
	const manager = editManagerFactory({ rebaser }).manager;
	for (let iChange = 0; iChange < localEditCount; iChange++) {
		manager.localBranch.apply(TestChange.emptyChange, mintRevisionTag());
	}
	const trunkEdits = makeArray(trunkEditCount, () => ({
		change: TestChange.emptyChange,
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

export function rebasePeerEditsOverTrunkEdits(
	peerEditCount: number,
	trunkEditCount: number,
	rebaser: TestChangeRebaser,
): void;
export function rebasePeerEditsOverTrunkEdits(
	peerEditCount: number,
	trunkEditCount: number,
	rebaser: TestChangeRebaser,
	defer: true,
): () => void;
export function rebasePeerEditsOverTrunkEdits(
	peerEditCount: number,
	trunkEditCount: number,
	rebaser: TestChangeRebaser,
	defer: boolean = false,
): void | (() => void) {
	const manager = editManagerFactory({ rebaser }).manager;
	for (let iChange = 0; iChange < trunkEditCount; iChange++) {
		manager.addSequencedChange(
			{
				change: TestChange.emptyChange,
				revision: mintRevisionTag(),
				sessionId: "trunk",
			},
			brand(iChange + 1),
			brand(iChange),
		);
	}
	const peerEdits = makeArray(peerEditCount, () => ({
		change: TestChange.emptyChange,
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

export function rebaseConcurrentPeerEdits(
	peerCount: number,
	editsPerPeerCount: number,
	rebaser: TestChangeRebaser,
	defer: true,
): () => void;
export function rebaseConcurrentPeerEdits(
	peerCount: number,
	editsPerPeerCount: number,
	rebaser: TestChangeRebaser,
): void;
export function rebaseConcurrentPeerEdits(
	peerCount: number,
	editsPerPeerCount: number,
	rebaser: TestChangeRebaser,
	defer: boolean = false,
): void | (() => void) {
	const manager = editManagerFactory({ rebaser }).manager;
	const peerEdits: Commit<TestChange>[] = [];
	for (let iChange = 0; iChange < editsPerPeerCount; iChange++) {
		for (let iPeer = 0; iPeer < peerCount; iPeer++) {
			peerEdits.push({
				change: TestChange.emptyChange,
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
