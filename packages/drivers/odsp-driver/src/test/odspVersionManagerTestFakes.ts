/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Shared in-memory fakes for the {@link OdspVersionManager} unit suites. They let the selection and
 * `validateBaseForReplay` logic be exercised without ODSP: the fake fetcher returns a canned
 * newest-first version list, resolves each version's sequence number from a lookup, and models the
 * epoch getters and retained op window used by `validateBaseForReplay`.
 */

import { MockLogger, createChildLogger } from "@fluidframework/telemetry-utils/internal";

/* eslint-disable import-x/no-internal-modules */
import {
	OdspVersionManager,
	type OdspFileVersionRef,
	type IOdspFileVersionFetcher,
} from "../odspVersionManager/odspVersionManager.js";
/* eslint-enable import-x/no-internal-modules */

/**
 * Build an {@link OdspFileVersionRef} with the given label. Timestamp/size are irrelevant to the
 * manager's selection logic, so they are fixed.
 */
export function ref(versionId: string): OdspFileVersionRef {
	return { versionId, lastModifiedDateTime: "2026-01-01T00:00:00.000Z" };
}

/**
 * The fake fetcher plus spies exposing what the manager asked of it.
 */
export interface FakeFetcher extends IOdspFileVersionFetcher {
	/** Number of times the version list was fetched. */
	readonly listCalls: () => number;
	/** Version ids passed to resolveSequenceNumber, in call order. */
	readonly resolvedIds: () => string[];
	/** (from, to) pairs passed to fetchOps, in call order. */
	readonly opsCalls: () => [number, number][];
}

/**
 * Optional epoch/ops behavior for {@link makeManager}, used by the `validateBaseForReplay` tests.
 * `liveEpoch`/`versionEpochs` back the epoch getters; `retainedOps` is the ascending set of sequence
 * numbers the fake server still retains, which `fetchOps` filters by the requested [from, to) range.
 */
export interface ReplayConfig {
	readonly liveEpoch?: string;
	readonly versionEpochs?: Record<string, string | undefined>;
	readonly retainedOps?: number[];
}

/*
 * Create a manager backed by in-memory fakes so the selection logic can be tested without ODSP.
 * `versions` is the newest-first list the fake `listFileVersions` returns; `seqByVersion` maps a
 * versionId to the sequence number the fake `resolveSequenceNumber` returns (a missing id makes it
 * throw, modelling a parse failure). `replay` configures the epoch getters and retained ops used by
 * the `validateBaseForReplay` path.
 */
export function makeManager(
	versions: OdspFileVersionRef[],
	seqByVersion: Record<string, number>,
	replay: ReplayConfig = {},
): { manager: OdspVersionManager; fetcher: FakeFetcher; logger: MockLogger } {
	let listCallCount = 0;
	const resolved: string[] = [];
	const opsCalls: [number, number][] = [];
	const retainedOps = replay.retainedOps ?? [];
	const logger = new MockLogger();
	const fetcher: FakeFetcher = {
		listFileVersions: async () => {
			listCallCount++;
			return versions;
		},
		resolveSequenceNumber: async (versionId: string) => {
			resolved.push(versionId);
			const seq: number | undefined = seqByVersion[versionId];
			if (seq === undefined) {
				throw new Error(`no sequence number configured for version ${versionId}`);
			}
			return seq;
		},
		getLiveDocumentEpoch: async () => replay.liveEpoch,
		getRecoverableVersionEpoch: async (versionId: string) =>
			replay.versionEpochs ? replay.versionEpochs[versionId] : replay.liveEpoch,
		fetchOps: async (from: number, to: number) => {
			opsCalls.push([from, to]);
			return retainedOps.filter((seq) => seq >= from && seq < to);
		},
		listCalls: () => listCallCount,
		resolvedIds: () => [...resolved],
		opsCalls: () => [...opsCalls],
	};
	return {
		manager: new OdspVersionManager(fetcher, createChildLogger({ logger })),
		fetcher,
		logger,
	};
}
