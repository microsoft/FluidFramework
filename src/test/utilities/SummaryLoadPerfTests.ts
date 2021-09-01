/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { SharedTreeWithAnchors } from '../../anchored-edits';
import { SharedTree } from '../../default-edits';
import { EditId } from '../../Identifiers';
import { deserialize } from '../../SummaryBackCompatibility';
import { SharedTreeSummaryWriteFormat } from '../../generic';
import {
	getDocumentFiles,
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	testDocumentsPathBase,
} from './TestUtilities';
import { TestFluidSerializer } from './TestSerializer';

/**
 * Runs a test suite for summary load perf on `SharedTree`.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSummaryLoadPerfTests<TSharedTree extends SharedTree | SharedTreeWithAnchors>(
	setUpLocalServerTestSharedTree: (
		options: LocalServerSharedTreeTestingOptions
	) => Promise<LocalServerSharedTreeTestingComponents<TSharedTree>>
) {
	describe('Summary Load', () => {
		const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;

		let tree: TSharedTree;

		const testSerializer = new TestFluidSerializer();

		const documentFolders = fs.readdirSync(testDocumentsPathBase);

		for (const document of documentFolders) {
			const { summaryByVersion, noHistorySummaryByVersion } = getDocumentFiles(document);

			const summarySets: { summaryByVersion: Map<string, string>; title: (version: string) => string }[] = [
				{
					summaryByVersion,
					title: (version: string) => `summary version ${version}`,
				},
				{
					summaryByVersion: noHistorySummaryByVersion,
					title: (version: string) => `no history summary version ${version}`,
				},
			];

			describe(`for document ${document}`, () => {
				summarySets.forEach(({ summaryByVersion, title }) => {
					for (const [version, serializedSummary] of summaryByVersion.entries()) {
						benchmark({
							type: BenchmarkType.Measurement,
							title: title(version),
							before: async () => {
								const testingComponents = await setUpLocalServerTestSharedTree({
									setupEditId,
									writeSummaryFormat: version as SharedTreeSummaryWriteFormat,
									// Uploading edit chunks is unnecessary for testing summary load
									uploadEditChunks: false,
								});
								tree = testingComponents.tree;
							},
							benchmarkFn: () => {
								const summary = deserialize(serializedSummary, testSerializer);
								tree.loadSummary(summary);
							},
						});
					}
				});
			});
		}
	});
}
