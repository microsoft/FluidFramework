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
			const version = 1;
			const summarizer = new TestVersionedSummarizer(
				"testKey",
				version,
				new Set([version]),
				version,
			);

			summarizer.summarize({ stringify });
			assert(
				summarizer.summarizeInternalCallCount === 1,
				"summarizeInternal should be called once",
			);
		});

		it("writes metadata blob", () => {
			const version = 1;
			const summarizer = new TestVersionedSummarizer(
				"testKey",
				version,
				new Set([version]),
				version,
			);

			const summary = summarizer.summarize({ stringify });

			const metadataBlob = summary.summary.tree[summarizablesMetadataKey] as ISummaryBlob;
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");

			const metadata = JSON.parse(
				metadataBlob.content as string,
			) as SharedTreeSummarizableMetadata;
			assert.equal(metadata.version, version, "Metadata version should be 1");
		});

		it("includes content from summarizeInternal in summary", () => {
			const version = 1;
			const summarizer = new TestVersionedSummarizer(
				"testKey",
				version,
				new Set([version]),
				version,
			);

			const summaryWithStats = summarizer.summarize({ stringify });
			const testContentBlob: ISummaryBlob | undefined = summaryWithStats.summary.tree[
				summarizer.key
			] as ISummaryBlob | undefined;
			assert(testContentBlob !== undefined, "Test content should exist in summary");
			assert.equal(testContentBlob.type, SummaryType.Blob, "Test content should be a blob");
		});
	});

	describe("load", () => {
		it("calls loadInternal", async () => {
			const version = 1;
			const summarizer = new TestVersionedSummarizer(
				"testKey",
				version,
				new Set([version]),
				version,
			);

			const storage = new MockStorage();
			await summarizer.load(storage, parse);
			assert(summarizer.loadInternalCallCount === 1, "loadInternal should be called once");
		});

		it("load successful: no metadata is supported", async () => {
			const version = 1;
			const summarizer = new TestVersionedSummarizer(
				"testKey",
				version,
				new Set([version]),
				version,
			);

			// Create a summary and delete the metadata blob to simulate older clients without metadata.
			const summary = summarizer.summarize({ stringify });
			Reflect.deleteProperty(summary.summary.tree, summarizablesMetadataKey);

			// Load from the summary
			const storage = MockStorage.createFromSummary(summary.summary);
			await assert.doesNotReject(summarizer.load(storage, parse));
		});

		it("load fails: no metadata is not supported", async () => {
			const oldVersion = 1;
			const summarizer = new TestVersionedSummarizer(
				"testKey",
				oldVersion,
				new Set([oldVersion]),
				oldVersion,
			);

			// Create a summary and delete the metadata blob.
			const summary = summarizer.summarize({ stringify });
			Reflect.deleteProperty(summary.summary.tree, summarizablesMetadataKey);

			const newStorage = MockStorage.createFromSummary(summary.summary);
			// Create another summarizer which doesn't support the default version anymore.
			const newVersion = oldVersion + 1;
			const newSummarizer = new TestVersionedSummarizer(
				"testKey",
				newVersion,
				new Set([newVersion]),
				oldVersion,
			);
			await assert.rejects(
				newSummarizer.load(newStorage, parse),
				validateUsageError(/Cannot read version/),
			);
		});

		it("load successful: metadata version is supported", async () => {
			const version = 1;
			// The version written in metadata is in supportedVersions.
			const summarizer = new TestVersionedSummarizer(
				"testKey",
				version,
				new Set([version]),
				version,
			);
			const summary = summarizer.summarize({ stringify });

			// Load from the summary
			const storage = MockStorage.createFromSummary(summary.summary);
			await assert.doesNotReject(summarizer.load(storage, parse));
		});

		it("load fails: metadata version is not supported", async () => {
			const newVersion = 1;
			const newSummarizer = new TestVersionedSummarizer(
				"testKey",
				newVersion,
				new Set([newVersion]),
				newVersion,
			);
			const newSummary = newSummarizer.summarize({ stringify });

			// Create summarizer that supports older version.
			const oldVersion = newVersion - 1;
			const oldSummarizer = new TestVersionedSummarizer(
				"testKey",
				oldVersion,
				new Set([oldVersion]),
				oldVersion,
			);

			const oldStorage = MockStorage.createFromSummary(newSummary.summary);
			await assert.rejects(
				oldSummarizer.load(oldStorage, parse),
				validateUsageError(/Cannot read version/),
			);
		});

		it("backward compatibility: newer reader can load older version", async () => {
			const oldVersion = 1;
			const oldSummarizer = new TestVersionedSummarizer(
				"testKey",
				oldVersion,
				new Set([oldVersion]),
				oldVersion,
			);
			const oldSummary = oldSummarizer.summarize({ stringify });

			// Create summarizer that supports old and new version.
			const newVersion = 2;
			const newSummarizer = new TestVersionedSummarizer(
				"testKey",
				newVersion,
				new Set([oldVersion, newVersion]),
				newVersion,
			);
			const newStorage = MockStorage.createFromSummary(oldSummary.summary);
			await assert.doesNotReject(newSummarizer.load(newStorage, parse));
		});
	});
});
