/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { join } from 'path';
import * as fs from 'fs';
import { takeAsync } from '@fluid-internal/stochastic-test-utils';
import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { SharedTree } from '../../SharedTree';
import { WriteFormat } from '../../persisted-types';
import { performFuzzActions } from '../fuzz/SharedTreeFuzzTests';
import { makeOpGenerator } from '../fuzz/Generators';
import { areRevisionViewsSemanticallyEqual } from '../../EditUtilities';
import { setUpLocalServerTestSharedTree, setUpTestSharedTree, testDocumentsPathBase } from './TestUtilities';
import { expectAssert } from './TestCommon';

const directory = join(testDocumentsPathBase, 'summary-load-perf-tests');

/**
 * Runs a test suite for summary load perf on `SharedTree`.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSummaryLoadPerfTests(title: string): void {
	describe(title, () => {
		// Re-enable this test for an easy way to write the test summary files to disk
		it.skip('save files to disk', async () => {
			await writeSummaryTestTrees();
		});

		const {
			summaryFileWithHistory_0_0_2,
			summaryFileNoHistory_0_0_2,
			summaryFileWithHistory_0_1_1,
			summaryFileNoHistory_0_1_1,
			// blobsFile: string;
		} = loadSummaryTestFiles();

		const tests = [
			{ title: 'load 0.0.2 format without history', file: summaryFileNoHistory_0_0_2 },
			{ title: 'load 0.0.2 format with history', file: summaryFileWithHistory_0_0_2 },
			{ title: 'load 0.1.1 format without history', file: summaryFileNoHistory_0_1_1 },
			{ title: 'load 0.1.1 format with history', file: summaryFileWithHistory_0_1_1 },
		];

		for (const { title, file } of tests) {
			benchmark({
				type: BenchmarkType.Measurement,
				title,
				benchmarkFn: () => {
					const { tree } = setUpTestSharedTree({ writeFormat: WriteFormat.v0_0_2 });
					tree.loadSerializedSummary(file);
				},
			});
		}
	});
}

async function generateRandomTree(
	seed: number,
	maxTreeSize: number,
	writeFormat: WriteFormat,
	summarizeHistory: boolean
): Promise<SharedTree> {
	const generator = takeAsync(
		1000,
		makeOpGenerator({
			editConfig: { maxTreeSize },
			joinConfig: {
				writeFormat: [writeFormat],
				summarizeHistory: [summarizeHistory],
				maximumActiveCollaborators: 2,
				maximumPassiveCollaborators: 0,
			},
		})
	);
	const { testObjectProvider } = await performFuzzActions(generator, seed, true);
	const { tree: finalTree } = await setUpLocalServerTestSharedTree({
		testObjectProvider,
		summarizeHistory,
		writeFormat,
	});
	await testObjectProvider.ensureSynchronized();
	return finalTree;
}

async function writeSummaryTestTrees(): Promise<void> {
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory);
	}

	const seed = 24601;
	const tree002 = await generateRandomTree(seed, 1000, WriteFormat.v0_0_2, true);
	const tree011 = await generateRandomTree(seed, 1000, WriteFormat.v0_1_1, true);
	const tree002NoHistory = await generateRandomTree(seed, 1000, WriteFormat.v0_0_2, false);
	const tree011NoHistory = await generateRandomTree(seed, 1000, WriteFormat.v0_1_1, false);

	expectAssert(areRevisionViewsSemanticallyEqual(tree002.currentView, tree002, tree011.currentView, tree011));
	expectAssert(
		areRevisionViewsSemanticallyEqual(tree002.currentView, tree002, tree002NoHistory.currentView, tree002NoHistory)
	);
	expectAssert(
		areRevisionViewsSemanticallyEqual(tree011.currentView, tree011, tree011NoHistory.currentView, tree011NoHistory)
	);
	const { promises: fsP } = fs;
	await fsP.writeFile(join(directory, 'summary-0-0-2.json'), tree002.saveSerializedSummary());
	await fsP.writeFile(join(directory, 'summary-0-1-1.json'), tree011.saveSerializedSummary());
	await fsP.writeFile(join(directory, 'summary-no-history-0-0-2.json'), tree002NoHistory.saveSerializedSummary());
	await fsP.writeFile(join(directory, 'summary-no-history-0-1-1.json'), tree011NoHistory.saveSerializedSummary());
}

function loadSummaryTestFiles(): {
	summaryFileWithHistory_0_0_2: string;
	summaryFileNoHistory_0_0_2: string;
	summaryFileWithHistory_0_1_1: string;
	summaryFileNoHistory_0_1_1: string;
} {
	const readFile = (name: string): string => {
		const contents = fs.readFileSync(join(directory, name), 'utf-8');
		// Round-trip the file so that performance testing summary doesn't require parsing unnecessary/unrealistic whitespace
		return JSON.stringify(JSON.parse(contents));
	};
	const summaryFileWithHistory_0_0_2 = readFile('summary-0-0-2.json');
	const summaryFileNoHistory_0_0_2 = readFile('summary-no-history-0-0-2.json');
	const summaryFileWithHistory_0_1_1 = readFile('summary-0-1-1.json');
	const summaryFileNoHistory_0_1_1 = readFile('summary-no-history-0-1-1.json');

	// Note: We don't bother writing/reading a "blobs" file for this test suite because loading a serialized summary
	// with history should never involve attempting to get any of those blobs.
	// This *is* a fair comparison from a perf perspective b/c the whole point of chunking edit history is to decrease
	// summary size for potentially unused edit information.

	return {
		summaryFileWithHistory_0_0_2,
		summaryFileNoHistory_0_0_2,
		summaryFileWithHistory_0_1_1,
		summaryFileNoHistory_0_1_1,
	};
}
