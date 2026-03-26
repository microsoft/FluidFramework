/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import YAML from "yaml";

/**
 * Map of catalogName → { packageName → versionRange }.
 * The default catalog (defined under `catalog:` in pnpm-workspace.yaml) is stored under the key "default".
 */
export type PnpmCatalogMap = Map<string, Record<string, string>>;

/**
 * Reads the pnpm-workspace.yaml at `workspaceRoot` and returns the catalog entries.
 * Returns an empty map if the file doesn't exist or has no catalogs.
 */
export function readPnpmCatalogs(workspaceRoot: string): PnpmCatalogMap {
	const catalogMap: PnpmCatalogMap = new Map();
	const yamlPath = path.join(workspaceRoot, "pnpm-workspace.yaml");

	let content: string;
	try {
		content = readFileSync(yamlPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return catalogMap;
		}
		throw error;
	}

	const workspace: {
		catalog?: Record<string, string>;
		catalogs?: Record<string, Record<string, string>>;
	} | null = YAML.parse(content);

	if (workspace === null) {
		return catalogMap;
	}

	if (workspace.catalog !== undefined) {
		catalogMap.set("default", workspace.catalog);
	}

	if (workspace.catalogs !== undefined) {
		for (const [name, entries] of Object.entries(workspace.catalogs)) {
			catalogMap.set(name, entries);
		}
	}

	return catalogMap;
}

/**
 * If `version` starts with "catalog:", looks up the real version from `catalogs`.
 * Otherwise returns `version` unchanged.
 *
 * Resolution rules (per pnpm spec):
 * - `catalog:` or `catalog:default` → look in the "default" entry (the `catalog:` section)
 * - `catalog:X` → look in the `catalogs.X` entry
 *
 * @throws If the referenced catalog or package is not found.
 */
export function resolveCatalogVersion(
	packageName: string,
	version: string,
	catalogs: PnpmCatalogMap,
): string {
	if (!version.startsWith("catalog:")) {
		return version;
	}

	const catalogRef = version.slice("catalog:".length);
	const catalogName = catalogRef === "" ? "default" : catalogRef;

	const catalog = catalogs.get(catalogName);
	if (catalog === undefined) {
		throw new Error(
			`pnpm catalog "${catalogName}" not found when resolving "${packageName}". Available catalogs: ${[...catalogs.keys()].join(", ") || "(none)"}`,
		);
	}

	const resolved = catalog[packageName];
	if (resolved === undefined) {
		throw new Error(`Package "${packageName}" not found in pnpm catalog "${catalogName}"`);
	}

	return resolved;
}
