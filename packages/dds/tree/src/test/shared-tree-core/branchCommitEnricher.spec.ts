/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { GraphCommit } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BranchCommitEnricher } from "../../shared-tree-core/branchCommitEnricher.js";
import { testIdCompressor } from "../utils.js";

import {
	MockChangeEnricher,
	type MockEnrichableChange,
} from "./defaultResubmitMachine.spec.js";

const revisionRoot = testIdCompressor.generateCompressedId();
const revision0 = testIdCompressor.generateCompressedId();
const revision1 = testIdCompressor.generateCompressedId();
const revision2 = testIdCompressor.generateCompressedId();
const revision3 = testIdCompressor.generateCompressedId();

const commit0: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revisionRoot,
		outputContext: revision0,
		updateCount: 0,
	},
	revision: revision0,
};

const commit1: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revision0,
		outputContext: revision1,
		updateCount: 0,
	},
	revision: revision1,
	parent: commit0,
};
const commit2: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revision1,
		outputContext: revision2,
		updateCount: 0,
	},
	revision: revision2,
	parent: commit1,
};
const commit3: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revision2,
		outputContext: revision3,
		updateCount: 0,
	},
	revision: revision3,
	parent: commit2,
};

const expectedEnriched1: MockEnrichableChange = {
	...commit1.change,
	updateCount: 1,
};
const expectedEnriched2: MockEnrichableChange = {
	...commit2.change,
	updateCount: 1,
};
const expectedEnriched3: MockEnrichableChange = {
	...commit3.change,
	updateCount: 1,
};

describe("BranchCommitEnricher", () => {
	it("Can enrich zero commits", () => {
		const changeEnricher = new MockChangeEnricher();
		const branchEnricher = new BranchCommitEnricher(changeEnricher);
		branchEnricher.prepareChanges([]);
		assert.equal(changeEnricher.calls, 0);
		assert.equal(changeEnricher.enriched, 0);
		assert.equal(changeEnricher.applied, 0);
	});

	it("Can enrich a single commit", () => {
		const changeEnricher = new MockChangeEnricher();
		const branchEnricher = new BranchCommitEnricher(changeEnricher);
		branchEnricher.prepareChanges([commit1]);
		const actualEnriched1 = branchEnricher.retrieveChange(commit1);
		assert.deepEqual(actualEnriched1, expectedEnriched1);
		assert.equal(changeEnricher.calls, 1);
		assert.equal(changeEnricher.enriched, 1);
		assert.equal(changeEnricher.applied, 1);
	});

	it("Can enrich multiple commits", () => {
		const changeEnricher = new MockChangeEnricher();
		const branchEnricher = new BranchCommitEnricher(changeEnricher);
		branchEnricher.prepareChanges([commit1, commit2, commit3]);
		const actualEnriched1 = branchEnricher.retrieveChange(commit1);
		assert.deepEqual(actualEnriched1, expectedEnriched1);
		const actualEnriched2 = branchEnricher.retrieveChange(commit2);
		assert.deepEqual(actualEnriched2, expectedEnriched2);
		const actualEnriched3 = branchEnricher.retrieveChange(commit3);
		assert.deepEqual(actualEnriched3, expectedEnriched3);
		assert.equal(changeEnricher.calls, 1);
		assert.equal(changeEnricher.enriched, 3);
		assert.equal(changeEnricher.applied, 3);
	});
});
