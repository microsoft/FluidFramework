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
	TestAnchorSet,
	TestChangeFamily,
	TestChange,
	testChangeFamilyFactory,
	TestChangeRebaser,
} from "../testChange";
import { MockRepairDataStoreProvider } from "../utils";
import { EditManager } from "../../shared-tree-core";
import { brand } from "../../util";

export type TestEditManager = EditManager<ChangeFamilyEditor, TestChange, TestChangeFamily>;

export function editManagerFactory(options: {
	rebaser?: ChangeRebaser<TestChange>;
	sessionId?: SessionId;
}): {
	manager: TestEditManager;
	anchors: TestAnchorSet;
	family: ChangeFamily<ChangeFamilyEditor, TestChange>;
} {
	const family = testChangeFamilyFactory(options.rebaser);
	const anchors = new TestAnchorSet();
	const manager = new EditManager<
		ChangeFamilyEditor,
		TestChange,
		ChangeFamily<ChangeFamilyEditor, TestChange>
	>(family, options.sessionId ?? "0", new MockRepairDataStoreProvider(), anchors);
	return { manager, anchors, family };
}

export function rebaseLocalEditsOverTrunkEdits(
	nbLocal: number,
	nbTrunk: number,
	rebaser: TestChangeRebaser,
): void {
	const manager = editManagerFactory({ rebaser }).manager;
	for (let iChange = 0; iChange < nbLocal; iChange++) {
		manager.localBranch.apply(TestChange.emptyChange, mintRevisionTag());
	}
	for (let iChange = 0; iChange < nbTrunk; iChange++) {
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
}

export function rebasePeerEditsOverTrunkEdits(
	nbPeer: number,
	nbTrunk: number,
	rebaser: TestChangeRebaser,
): void {
	const manager = editManagerFactory({ rebaser }).manager;
	for (let iChange = 0; iChange < nbTrunk; iChange++) {
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
	for (let iChange = 0; iChange < nbPeer; iChange++) {
		manager.addSequencedChange(
			{
				change: TestChange.emptyChange,
				revision: mintRevisionTag(),
				sessionId: "peer",
			},
			brand(iChange + nbTrunk + 1),
			brand(0),
		);
	}
}
