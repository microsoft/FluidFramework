/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { copyDocument, copyInventory, selfHostDocumentExists } from "./copy.mjs";
import { createResults, recordSuccess, writeStageResults } from "../configuration/results.mjs";
import { createMetrics } from "../configuration/metrics.mjs";
import { fixture } from "./fixtures.mjs";

/** Compare the original credential-fetch pattern with bounded tenant-scoped copying, without Azure writes. */
export async function benchmark({ documents = 12, latencyMs = 5, keyLatencyMs = 20 } = {}) {
	const rows = [];
	for (const concurrency of [0, 1, 2, 4]) {
		const root = await mkdtemp(path.join(os.tmpdir(), "selfhost-copy-benchmark-"));
		const f = fixture({ documents, latencyMs, keyLatencyMs });
		const metrics = createMetrics();
		const started = performance.now();
		try {
			if (concurrency === 0) {
				const results = createResults(f.inventory);
				for (const documentId of f.inventory.tenants["source-1"].documents) {
					await f.dependencies.destinationKey(
						{ selfHostTenantId: "destination-1" },
						async (selfHostKey) => {
							await selfHostDocumentExists(
								"https://alfred.example",
								"destination-1",
								documentId,
								selfHostKey,
								f.dependencies.fetchImplementation,
								{ metrics },
							);
							await f.dependencies.sourceKey(
								f.config.azureFluidRelayTenants["source-1"],
								async (azureFluidRelayKey) => {
									await copyDocument({
										azureFluidRelayEndpoint: "https://discovery.example",
										azureFluidRelayTenantId: "source-1",
										selfHostEndpoint: "https://alfred.example",
										selfHostTenantId: "destination-1",
										documentId,
										azureFluidRelayKey,
										selfHostKey,
										fetchImplementation: f.dependencies.fetchImplementation,
										metrics,
									});
								},
							);
						},
					);
					recordSuccess(results, "source-1", documentId, documentId);
					await metrics.measure("results-persistence", () =>
						writeStageResults(root, "document-copy", results),
					);
				}
			} else {
				const outcome = await copyInventory(
					{ ...f, resultsDirectory: root, options: { concurrency } },
					{ ...f.dependencies, metrics },
				);
				if (outcome.failed)
					throw new Error("Controlled benchmark did not copy every document");
			}
			const elapsedMs = performance.now() - started;
			rows.push({
				mode:
					concurrency === 0
						? "per-document keys, serial"
						: `tenant keys, ${concurrency} worker(s)`,
				documents,
				elapsedMs: Math.round(elapsedMs),
				documentsPerMinute: Math.round((documents * 60_000) / elapsedMs),
				keyRetrievals: f.acquired.length,
				metrics: metrics.snapshot(documents),
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}
	return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	console.log(
		"Synthetic fixture benchmark: 12 documents, 5 ms/request, 20 ms/key lookup. Not an Azure throughput forecast.",
	);
	const rows = await benchmark();
	console.table(rows.map(({ metrics, ...row }) => row));
}
