/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type ISummaryBlob } from "@fluidframework/driver-definitions/internal";
import type { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { MockStorage, validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	VersionedSummarizer,
	summarizablesMetadataKey,
	type SharedTreeSummarizableMetadata,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "../../shared-tree-core/index.js";

class TestVersionedSummarizer extends VersionedSummarizer {
	public summarizeInternalCallCount = 0;
	public loadInternalCallCount = 0;

	protected summarizeInternal(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		builder: SummaryTreeBuilder;
	}): void {
		this.summarizeInternalCallCount++;
		// Add some test content to the builder
		props.builder.addBlob(this.key, props.stringify({ data: "test" }));
	}

	protected async loadInternal(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		this.loadInternalCallCount++;
	}
}

describe("VersionedSummarizer", () => {
	const stringify: SummaryElementStringifier = JSON.stringify;
	const parse: SummaryElementParser = JSON.parse;

	describe("summarize", () => {
		it("calls summarizeInternal", () => {
			const summarizer = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 1,
				supportedReadVersions: new Set([1]),
			});

			summarizer.summarize({ stringify });
			assert(
				summarizer.summarizeInternalCallCount === 1,
				"summarizeInternal should be called once",
			);
		});

		it("writes metadata blob when writeVersion is defined", () => {
			const summarizer = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 1,
				supportedReadVersions: new Set([1]),
			});

			const summary = summarizer.summarize({ stringify });

			const metadataBlob = summary.summary.tree[summarizablesMetadataKey] as ISummaryBlob;
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");

			const metadata = JSON.parse(
				metadataBlob.content as string,
			) as SharedTreeSummarizableMetadata;
			assert.equal(metadata.version, 1, "Metadata version should be 1");
		});

		it("does not write metadata blob when writeVersion is undefined", () => {
			const summarizer = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: undefined,
				supportedReadVersions: new Set([1]),
			});

			const summary = summarizer.summarize({ stringify });
			const metadataBlob = summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob === undefined, "Metadata blob should not exist");
		});

		it("includes content from summarizeInternal in summary", () => {
			const summarizer = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 1,
				supportedReadVersions: new Set([1]),
			});

			const summaryWithStats = summarizer.summarize({ stringify });
			const testContentBlob = summaryWithStats.summary.tree[summarizer.key];
			assert(testContentBlob !== undefined, "Test content should exist in summary");
			assert.equal(testContentBlob.type, SummaryType.Blob, "Test content should be a blob");
		});
	});

	describe("load", () => {
		it("calls loadInternal", async () => {
			const summarizer = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 1,
				supportedReadVersions: new Set([1]),
			});

			const storage = new MockStorage();
			await summarizer.load(storage, parse);
			assert(summarizer.loadInternalCallCount === 1, "loadInternal should be called once");
		});

		it("loads successfully when there is no metadata", async () => {
			const summarizer = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: undefined,
				supportedReadVersions: new Set([1]),
			});

			// Create a summary with metadata
			const summary = summarizer.summarize({ stringify });
			const metadataBlob = summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob === undefined, "Metadata blob should not exist");

			// Load from the summary
			const storage = MockStorage.createFromSummary(summary.summary);
			await assert.doesNotReject(summarizer.load(storage, parse));
		});

		it("loads successfully when metadata version is supported", async () => {
			const summarizer = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 1,
				supportedReadVersions: new Set([1, 2]),
			});

			// Create a summary with metadata
			const summary = summarizer.summarize({ stringify });

			// Load from the summary
			const storage = MockStorage.createFromSummary(summary.summary);
			await assert.doesNotReject(summarizer.load(storage, parse));
		});

		it("load fails when metadata version is not supported", async () => {
			const summarizer1 = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 2,
				supportedReadVersions: new Set([2]),
			});

			// Create a summary with version 2 metadata
			const summary = summarizer1.summarize({ stringify });

			// Try to load with a summarizer that doesn't support version 2
			const summarizer2 = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 1,
				supportedReadVersions: new Set([1]),
			});

			const storage = MockStorage.createFromSummary(summary.summary);
			await assert.rejects(
				summarizer2.load(storage, parse),
				validateUsageError(/Cannot read version/),
			);
		});

		it("backward compatibility: newer reader can load older version", async () => {
			// Create summary with version 1
			const summarizer1 = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 1,
				supportedReadVersions: new Set([1]),
			});
			const summary = summarizer1.summarize({ stringify });

			// Load with a reader that supports versions 1 and 2
			const summarizer2 = new TestVersionedSummarizer({
				key: "testKey",
				writeVersion: 2,
				supportedReadVersions: new Set([1, 2]),
			});
			const storage = MockStorage.createFromSummary(summary.summary);
			await assert.doesNotReject(summarizer2.load(storage, parse));
		});
	});
});
