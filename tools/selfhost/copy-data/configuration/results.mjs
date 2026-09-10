import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const RESULTS_FILE_NAME = "data-transfer-results.json";

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/** Create a result collection grouped by source tenant. */
export function createResults(inventory) {
	const tenants = {};
	for (const [tenantId, tenant] of Object.entries(inventory.tenants)) {
		tenants[tenantId] = {
			selfHostTenantId: tenant.selfHostTenantId || tenantId,
			successful: [],
			failed: [],
		};
	}
	return { generatedAt: new Date().toISOString(), tenants };
}

export function recordSuccess(results, tenantId, documentId, targetDocumentId) {
	results.tenants[tenantId].successful.push({
		documentId,
		...(targetDocumentId === undefined ? {} : { targetDocumentId }),
	});
}

export function recordFailure(results, tenantId, failure) {
	results.tenants[tenantId].failed.push(failure);
}

/** Add one stage's non-sensitive outcomes to the shared owner-only results file. */
export async function writeStageResults(resultsDirectory, stage, results) {
	const resolvedDirectory = path.resolve(resultsDirectory);
	const resultsPath = path.join(resolvedDirectory, RESULTS_FILE_NAME);
	await mkdir(resolvedDirectory, { recursive: true, mode: 0o700 });

	let existing = { stages: {} };
	try {
		existing = JSON.parse(await readFile(resultsPath, "utf8"));
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}

	const updated = {
		...existing,
		updatedAt: new Date().toISOString(),
		stages: {
			...existing.stages,
			[stage]: results,
		},
	};
	const temporaryPath = `${resultsPath}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(updated, undefined, "\t")}\n`, { encoding: "utf8", mode: 0o600 });
	await rename(temporaryPath, resultsPath);
	return resultsPath;
}
