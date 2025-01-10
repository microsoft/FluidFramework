/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

// eslint-disable-next-line import/no-internal-modules
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { OpenAI, AzureOpenAI } from "openai";

/**
 * Validates that the error is a UsageError with the expected error message.
 */
export function validateUsageError(expectedErrorMsg: string | RegExp): (error: Error) => true {
	return (error: Error) => {
		assert(error instanceof UsageError);
		if (
			typeof expectedErrorMsg === "string"
				? error.message !== expectedErrorMsg
				: !expectedErrorMsg.test(error.message)
		) {
			throw new Error(
				`Unexpected assertion thrown\nActual: ${error.message}\nExpected: ${expectedErrorMsg}`,
			);
		}
		return true;
	};
}

/**
 * Creates an OpenAI Client session.
 * Depends on the following environment variables:
 *
 * If using the OpenAI API:
 * - OPENAI_API_KEY
 *
 * If using the Azure OpenAI API:
 * - AZURE_OPENAI_API_KEY
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_DEPLOYMENT
 *
 */
export function initializeOpenAIClient(service: "openai" | "azure"): OpenAI {
	if (service === "azure") {
		const apiKey = process.env.AZURE_OPENAI_API_KEY;
		if (apiKey === null || apiKey === undefined) {
			throw new Error("AZURE_OPENAI_API_KEY environment variable not set");
		}

		const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
		if (endpoint === null || endpoint === undefined) {
			throw new Error("AZURE_OPENAI_ENDPOINT environment variable not set");
		}

		const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
		if (deployment === null || deployment === undefined) {
			throw new Error("AZURE_OPENAI_DEPLOYMENT environment variable not set");
		}

		const client = new AzureOpenAI({
			endpoint,
			deployment,
			apiKey,
			apiVersion: "2024-08-01-preview",
			timeout: 2500000,
		});
		return client;
	} else {
		const apiKey = process.env.OPENAI_API_KEY;
		if (apiKey === null || apiKey === undefined) {
			throw new Error("OPENAI_API_KEY environment variable not set");
		}

		const client = new OpenAI({ apiKey });
		return client;
	}
}

/**
 * A utility class for snapshot testing.
 */
export class MochaSnapshotUnitTester {
	public static readonly DEFAULT_SNAPSHOT_DIRECTORY: string = "__snapshots__";

	public constructor(
		public readonly snapshotDirectory: string,
		public readonly suiteName: string,
	) {}

	public expectToMatchSnapshot(
		mochaContext: Mocha.Context,
		output: string,
		snapshotFileName: string,
		options?: { metadata?: Record<string, string> },
	): void {
		// Directory to store snapshots
		const snapshotDir: string = path.join(
			this.snapshotDirectory,
			MochaSnapshotUnitTester.DEFAULT_SNAPSHOT_DIRECTORY,
			this.suiteName,
		);

		if (!fs.existsSync(snapshotDir)) {
			fs.mkdirSync(snapshotDir, { recursive: true });
		}

		const testName: string = snapshotFileName;
		const snapshotFile: string = path.join(snapshotDir, `${testName}.snap`);

		const shouldUpdateSnapshot: boolean = process.env.UPDATE_SNAPSHOTS === "true";

		const doesFileAlreadyExist = fs.existsSync(snapshotFile);
		if (doesFileAlreadyExist && !shouldUpdateSnapshot) {
			// Snapshot exists, compare outputs
			const fileContent: string = fs.readFileSync(snapshotFile, "utf8");
			const expectedOutput = this.removeMetadata(fileContent);
			assert.strictEqual(
				output.trim(),
				expectedOutput.trim(),
				`Snapshot mismatch for test: ${testName}`,
			);
		} else {
			// Add metadata headers
			const metadataJson: Record<string, string> = { ...options?.metadata };
			if (mochaContext.test?.parent?.title !== undefined) {
				metadataJson["Test Suite Title"] = mochaContext.test?.parent?.title;
			}
			if (mochaContext.test?.title !== undefined) {
				metadataJson["Test Title"] = mochaContext.test?.title;
			}
			const metadata = this.generateMetadata(metadataJson);

			const snapshotContent = `${metadata}\n\n${output.trim()}`;

			// Save the snapshot
			fs.writeFileSync(snapshotFile, snapshotContent, "utf8");
			console.log(
				`Snapshot ${doesFileAlreadyExist ? "updated" : "created"} for test: ${testName}`,
			);
		}
	}

	/**
	 * Generate metadata headers for the snapshot.
	 */
	private generateMetadata(additionalMetadata?: Record<string, string>): string {
		const metadataEntries = {
			"Generated on": new Date().toISOString(),
			"description": "This is a snapshot file utilized for testing purposes.",
			...additionalMetadata,
		};

		// Format metadata as a block enclosed by `---`
		const metadata = Object.entries(metadataEntries)
			.map(([key, value]) => `${key}: ${value}`)
			.join("\n");

		return `---\n${metadata}\n---`;
	}

	/**
	 * Remove metadata from the snapshot content before comparison.
	 */
	private removeMetadata(content: string): string {
		// Remove metadata block delimited by `---`
		// eslint-disable-next-line unicorn/better-regex
		return content.replace(/^---[\s\S]*?---\n*/, "").trim();
	}
}
