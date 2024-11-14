/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import {
	type ChangeFamily,
	type ChangeFamilyEditor,
	type ChangeRebaser,
	type DeltaRoot,
	type RevisionTag,
	emptyDelta,
} from "../../../core/index.js";
import { type Commit, EditManager } from "../../../shared-tree-core/index.js";
import { type RecursiveReadonly, brand, makeArray } from "../../../util/index.js";
import {
	TestChange,
	type TestChangeFamily,
	asDelta,
	testChangeFamilyFactory,
} from "../../testChange.js";
import { mintRevisionTag, testIdCompressor } from "../../utils.js";
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
	});

	return { manager, family };
}

export function editManagerFactory<TChange = TestChange>(
	family: ChangeFamily<ChangeFamilyEditor, TChange>,
	options: {
		sessionId?: SessionId;
	} = {},
): EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>> {
	const genId = () => testIdCompressor.generateCompressedId();
	const manager = new EditManager<
		ChangeFamilyEditor,
		TChange,
		ChangeFamily<ChangeFamilyEditor, TChange>
	>(family, options.sessionId ?? ("0" as SessionId), genId);

	return manager;
}

/**
 * Simulates the following inputs to the EditManager:
 * - Apply local edit L1 with a ref seq# pointing to edit 0
 * ...(not incrementing the ref seq# for each L)
 * - Apply local edit Lc with a ref seq# pointing to edit 0
 * -- we start measuring from here
 * - Sequence trunk edit T1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each T)
 * - Sequence trunk edit Tc with a ref seq# pointing to edit Tc-1
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)─(T1)─...─(Tc)
 *   └───────────────(L1)─...─(Lc)
 * ```
 *
 * @param localEditCount - The number of local edits to generate
 * @param trunkEditCount - The number of trunk edits to generate
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 */
export function rebaseLocalEditsOverTrunkEdits<TChange>(
	localEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
): void;
/**
 * Simulates the following inputs to the EditManager:
 * - Apply local edit L1 with a ref seq# pointing to edit 0
 * ...(not incrementing the ref seq# for each L)
 * - Apply local edit Lc with a ref seq# pointing to edit 0
 * -- inputs below this point are deferred until the returned thunk is invoked --
 * - Sequence trunk edit T1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each T)
 * - Sequence trunk edit Tc with a ref seq# pointing to edit Tc-1
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)─(T1)─...─(Tc)
 *   └───────────────(L1)─...─(Lc)
 * ```
 *
 * @param localEditCount - The number of local edits to generate
 * @param trunkEditCount - The number of trunk edits to generate
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 * @param defer - Used to invoke this specific overload.
 * @returns A thunk that will apply the local edits when invoked.
 */
export function rebaseLocalEditsOverTrunkEdits<TChange>(
	localEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: true,
): () => void;
export function rebaseLocalEditsOverTrunkEdits<TChange>(
	localEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: boolean = false,
): void | (() => void) {
	subscribeToLocalBranch(manager);
	for (let iChange = 0; iChange < localEditCount; iChange++) {
		const revision = mintRevisionTag();
		manager.localBranch.apply({ change: mintChange(undefined), revision });
	}
	const trunkEdits = makeArray(trunkEditCount, () => {
		const revision = mintRevisionTag();
		return {
			change: mintChange(revision),
			revision,
			sessionId: "trunk" as SessionId,
		};
	});
	const run = () => {
		for (let iChange = 0; iChange < trunkEditCount; iChange++) {
			manager.addSequencedChange(trunkEdits[iChange], brand(iChange + 1), brand(iChange));
		}
	};
	return defer ? run : run();
}

/**
 * Simulates the following inputs to the EditManager:
 * - Sequence trunk edit T1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each T)
 * - Sequence trunk edit Tc with a ref seq# pointing to edit Tc-1
 * - Sequence peer edit P1 with a ref seq# pointing to edit 0
 * ...(not incrementing the ref seq# for each P)
 * - Sequence peer edit Pc with a ref seq# pointing to edit 0
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)─(T1)─...─(Tc)
 *   └───────────────(P1)─...─(Pc)
 * ```
 *
 * @param peerEditCount - The number of peer edits to generate
 * @param trunkEditCount - The number of trunk edits to generate
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 */
export function rebasePeerEditsOverTrunkEdits<TChange>(
	peerEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
): void;
/**
 * Simulates the following inputs to the EditManager:
 * - Sequence trunk edit T1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each T)
 * - Sequence trunk edit Tc with a ref seq# pointing to edit Tc-1
 * -- inputs below this point are deferred until the returned thunk is invoked --
 * - Sequence peer edit P1 with a ref seq# pointing to edit 0
 * ...(not incrementing the ref seq# for each P)
 * - Sequence peer edit Pc with a ref seq# pointing to edit 0
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)─(T1)─...─(Tc)
 *   └───────────────(P1)─...─(Pc)
 * ```
 *
 * @param peerEditCount - The number of peer edits to generate
 * @param trunkEditCount - The number of trunk edits to generate
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 * @param defer - Used to invoke this specific overload.
 * @returns A thunk that will apply the peer edits when invoked.
 */
export function rebasePeerEditsOverTrunkEdits<TChange>(
	peerEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: true,
): () => void;
export function rebasePeerEditsOverTrunkEdits<TChange>(
	peerEditCount: number,
	trunkEditCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: boolean = false,
): void | (() => void) {
	subscribeToLocalBranch(manager);
	for (let iChange = 0; iChange < trunkEditCount; iChange++) {
		const revision = mintRevisionTag();
		manager.addSequencedChange(
			{
				change: mintChange(revision),
				revision,
				sessionId: "trunk" as SessionId,
			},
			brand(iChange + 1),
			brand(iChange),
		);
	}
	const peerEdits = makeArray(peerEditCount, () => {
		const revision = mintRevisionTag();
		return {
			change: mintChange(revision),
			revision,
			sessionId: "peer" as SessionId,
		};
	});
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
 * Simulates the following inputs to the EditManager:
 * - Sequence trunk edit T1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each T)
 * - Sequence trunk edit Tc with a ref seq# pointing to edit Tc-1
 * - Sequence peer edit P1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each P)
 * - Sequence peer edit Pc with a ref seq# pointing to edit Tc-1
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)─(T1)─...─(Tc─1)─(Tc)
 *   |    |          └──────(P1)─(P2)─...─(Pc)
 *   |    └─────────────────(P1)─(P2)
 *   └──────────────────────(P1)
 * ```
 *
 * @param editCount - The number of peer and trunk edits to generate.
 * The total number of edits generated will be twice that.
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 */
export function rebaseAdvancingPeerEditsOverTrunkEdits<TChange>(
	editCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: () => TChange,
): void;
/**
 * Simulates the following inputs to the EditManager:
 * - Sequence trunk edit T1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each T)
 * - Sequence trunk edit Tc with a ref seq# pointing to edit Tc-1
 * -- inputs below this point are deferred until the returned thunk is invoked --
 * - Sequence peer edit P1 with a ref seq# pointing to edit 0
 * ...(incrementing the ref seq# for each P)
 * - Sequence peer edit Pc with a ref seq# pointing to edit Tc-1
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)─(T1)─...─(Tc─1)─(Tc)
 *   |    |          └──────(P1)─(P2)─...─(Pc)
 *   |    └─────────────────(P1)─(P2)
 *   └──────────────────────(P1)
 * ```
 *
 * @param editCount - The number of peer and trunk edits to generate.
 * The total number of edits generated will be twice that.
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 * @param defer - Used to invoke this specific overload.
 * @returns A thunk that will apply the peer edits when invoked.
 */
export function rebaseAdvancingPeerEditsOverTrunkEdits<TChange>(
	editCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: true,
): () => void;
export function rebaseAdvancingPeerEditsOverTrunkEdits<TChange>(
	editCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: boolean = false,
): void | (() => void) {
	subscribeToLocalBranch(manager);
	for (let iChange = 0; iChange < editCount; iChange++) {
		const revision = mintRevisionTag();
		manager.addSequencedChange(
			{
				change: mintChange(revision),
				revision,
				sessionId: "trunk" as SessionId,
			},
			brand(iChange + 1),
			brand(iChange),
		);
	}
	const peerEdits = makeArray(editCount, () => {
		const revision = mintRevisionTag();
		return {
			change: mintChange(revision),
			revision,
			sessionId: "peer" as SessionId,
		};
	});
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

/**
 * Simulates the following inputs to the EditManager:
 * Each peer edit is sequenced in a round-robin fashion starting with the first edit from peer 1 then
 * the first edit from peer 2, etc. Then the second edit from each peer (in the same peer order) etc.
 * All edit have a reference sequence number of 0.
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)
 *   ├─(P1E1)───────────────(P1E2)──────...──────(P1Ek)
 *   ├────────(P2E1)───────────────(P2E2)──────...──────(P2Ek)
 *   ├...
 *   └───────────────(PnE1)───────────────(PnE2)──────...──────(PnEk)
 * ```
 *
 * @param peerCount - The number of peer to generate edits for.
 * @param editCount - The number of edits to generate per peer.
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 */
export function rebaseConcurrentPeerEdits<TChange>(
	peerCount: number,
	editsPerPeerCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: true,
): () => void;
/**
 * Simulates the following inputs to the EditManager:
 * Each peer edit is sequenced in a round-robin fashion starting with the first edit from peer 1 then
 * the first edit from peer 2, etc. Then the second edit from each peer (in the same peer order) etc.
 * All edit have a reference sequence number of 0.
 *
 * This defines the following relationships between edits:
 * ```text
 * (0)
 *   ├─(P1E1)───────────────(P1E2)──────...──────(P1Ek)
 *   ├────────(P2E1)───────────────(P2E2)──────...──────(P2Ek)
 *   ├...
 *   └───────────────(PnE1)───────────────(PnE2)──────...──────(PnEk)
 * ```
 *
 * @param peerCount - The number of peer to generate edits for.
 * @param editCount - The number of edits to generate per peer.
 * @param manager - The edit manager to apply the edits to
 * @param mintChange - A function used to generate new changes
 * @param defer - Used to invoke this specific overload.
 * @returns A thunk that will apply the peer edits when invoked.
 */
export function rebaseConcurrentPeerEdits<TChange>(
	peerCount: number,
	editsPerPeerCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
): void;
export function rebaseConcurrentPeerEdits<TChange>(
	peerCount: number,
	editsPerPeerCount: number,
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
	mintChange: (revision: RevisionTag | undefined) => TChange,
	defer: boolean = false,
): void | (() => void) {
	subscribeToLocalBranch(manager);
	const peerEdits: Commit<TChange>[] = [];
	for (let iChange = 0; iChange < editsPerPeerCount; iChange++) {
		for (let iPeer = 0; iPeer < peerCount; iPeer++) {
			const revision = mintRevisionTag();
			peerEdits.push({
				change: mintChange(revision),
				revision,
				sessionId: `p${iPeer}` as SessionId,
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

export function checkChangeList(manager: TestEditManager, intentions: number[]): void {
	TestChange.checkChangeList(getAllChanges(manager), intentions);
}

export function getAllChanges(manager: TestEditManager): RecursiveReadonly<TestChange>[] {
	return manager.getTrunkChanges().concat(manager.getLocalChanges());
}

/** Adds a sequenced change to an `EditManager` and returns the delta that was caused by the change */
export function addSequencedChange(
	editManager: TestEditManager,
	...args: Parameters<(typeof editManager)["addSequencedChange"]>
): DeltaRoot {
	let delta: DeltaRoot = emptyDelta;
	const offChange = editManager.localBranch.events.on("afterChange", ({ change }) => {
		if (change !== undefined) {
			delta = asDelta(change.change.intentions);
		}
	});
	editManager.addSequencedChange(...args);
	offChange();
	return delta;
}

/** Subscribe to the local branch to emulate the behavior of SharedTree */
function subscribeToLocalBranch<TChange>(
	manager: EditManager<ChangeFamilyEditor, TChange, ChangeFamily<ChangeFamilyEditor, TChange>>,
): void {
	manager.localBranch.events.on("afterChange", (branchChange) => {
		// Reading the change property causes lazy computation to occur, and is important to accurately emulate SharedTree behavior
		const _change = branchChange.change;
	});
}
