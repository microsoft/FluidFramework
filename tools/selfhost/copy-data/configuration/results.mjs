/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { ConfigurationError } from "./configuration.mjs";

export const RESULTS_FILE_NAME = "copy-data-results.json";
const pendingWrites = new Map();

/** Create a result collection grouped by Azure Fluid Relay tenant. */
export function createResults(inventory) {
	const tenants = {};
	for (const [tenantId, tenant] of Object.entries(inventory.tenants)) {
		tenants[tenantId] = {
			selfHostTenantId: tenant.selfHostTenantId || tenantId,
			successful: [],
			warnings: [],
			failed: [],
		};
	}
	return { generatedAt: new Date().toISOString(), tenants };
}

export function recordSuccess(
	results,
	tenantId,
	documentId,
	selfHostDocumentId,
	ignoredLogTailOperations = 0,
) {
	results.tenants[tenantId].successful.push({
		documentId,
		...(selfHostDocumentId === undefined ? {} : { selfHostDocumentId }),
		...(ignoredLogTailOperations > 0 ? { ignoredLogTailOperations } : {}),
	});
}

export function recordWarning(results, tenantId, documentId, warning) {
	results.tenants[tenantId].warnings.push({
		documentId,
		message: warning.message,
		...(typeof warning.status === "number" ? { httpStatus: warning.status } : {}),
	});
}

export function recordFailure(results, tenantId, failure) {
	results.tenants[tenantId].failed.push(failure);
}

/** Add one stage's non-sensitive outcomes to the shared owner-only results file. */
export async function withResultsLock(
	resultsDirectory,
	operation,
	name = "copy-data.run.lock",
) {
	const directory = path.resolve(resultsDirectory);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const lockPath = path.join(directory, name);
	let lock;
	try {
		lock = await open(lockPath, "wx", 0o600);
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		throw new ConfigurationError([
			`Results are locked (${name}). Stop other copy-data commands before continuing. After an interrupted process, confirm it has exited before removing this lock file.`,
		]);
	}
	try {
		await lock.writeFile(JSON.stringify({ processId: process.pid }));
		return await operation();
	} finally {
		await lock.close();
		await rm(lockPath);
	}
}

export function writeStageResults(
	resultsDirectory,
	stage,
	results,
	{ renameFile = rename, priorStages = {}, warn = console.warn } = {},
) {
	const resolvedDirectory = path.resolve(resultsDirectory);
	const resultsPath = path.join(resolvedDirectory, RESULTS_FILE_NAME);
	// Capture at submission, not after another worker has changed the shared collection.
	const snapshot = structuredClone(results);
	const write = () =>
		withResultsLock(
			resolvedDirectory,
			async () => {
				let existing = { stages: {} };
				let contents;
				let corrupt = false;
				try {
					contents = await readFile(resultsPath, "utf8");
				} catch (error) {
					if (error?.code !== "ENOENT")
						throw new ConfigurationError([
							"Unable to read the existing results file; it was not overwritten. Check read access or configure a different resultsDirectory.",
						]);
				}
				if (contents !== undefined) {
					try {
						existing = JSON.parse(contents);
					} catch (error) {
						if (!(error instanceof SyntaxError)) throw error;
						corrupt = true;
					}
				}
				if (
					!existing ||
					typeof existing.stages !== "object" ||
					existing.stages === null ||
					Array.isArray(existing.stages)
				)
					corrupt = true;
				if (corrupt) existing = { stages: {} };
				const updated = {
					...existing,
					updatedAt: new Date().toISOString(),
					stages: { ...priorStages, ...existing.stages, [stage]: snapshot },
				};
				const temporaryPath = `${resultsPath}.tmp-${randomUUID()}`;
				let backupPath;
				let temporary;
				try {
					temporary = await open(temporaryPath, "wx", 0o600);
					await temporary.writeFile(`${JSON.stringify(updated, undefined, "\t")}\n`);
					await temporary.sync();
					await temporary.close();
					temporary = undefined;
					if (corrupt) {
						backupPath = `${resultsPath}.corrupt-${randomUUID()}`;
						const backup = await open(backupPath, "wx", 0o600);
						try {
							await backup.writeFile(contents);
							await backup.sync();
						} finally {
							await backup.close();
						}
					}
					await renameFile(temporaryPath, resultsPath);
				} finally {
					await temporary?.close();
					await rm(temporaryPath, { force: true });
				}
				if (corrupt)
					warn(
						`WARNING: Existing results were corrupt and were preserved at ${backupPath}. Current results were saved to ${resultsPath}; earlier outcomes could not be recovered. Review destination state before retrying documents from earlier runs.`,
					);
				return resultsPath;
			},
			"copy-data.write.lock",
		);

	// Each caller observes its own error; later writes may proceed after a failed submission.
	const next = (pendingWrites.get(resultsPath) ?? Promise.resolve()).then(write, write);
	pendingWrites.set(resultsPath, next);
	const release = () => {
		if (pendingWrites.get(resultsPath) === next) pendingWrites.delete(resultsPath);
	};
	next.then(release, release);
	return next;
}
