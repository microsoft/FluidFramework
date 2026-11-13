/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import YAML from "yaml";

/**
 * Collects updates to one named pnpm catalog and saves them without replacing other workspace settings or comments.
 */
export class PnpmCatalogEditor {
	/**
	 * The package aliases and version constraints to write to the catalog.
	 */
	public readonly updates = new Map<string, string>();

	private readonly yamlPath: string;
	private readonly document: YAML.Document;
	private readonly newline: string;

	public constructor(
		workspaceRoot: string,
		private readonly catalogName: string,
	) {
		this.yamlPath = path.join(workspaceRoot, "pnpm-workspace.yaml");
		const content = readFileSync(this.yamlPath, "utf-8");
		this.newline = content.includes("\r\n") ? "\r\n" : "\n";
		this.document = YAML.parseDocument(content);
		if (this.document.errors.length > 0) {
			throw new Error(
				`Unable to parse pnpm workspace '${this.yamlPath}': ${this.document.errors.map((error) => error.message).join("; ")}`,
			);
		}

		if (this.document.contents !== null && !YAML.isMap(this.document.contents)) {
			throw new Error(`Expected a mapping in pnpm workspace '${this.yamlPath}'`);
		}
		for (const keys of [["catalogs"], ["catalogs", catalogName]]) {
			const node = this.document.getIn(keys, true);
			if (node !== undefined && !YAML.isMap(node)) {
				throw new Error(
					`Expected a mapping at '${keys.join(".")}' in pnpm workspace '${this.yamlPath}'`,
				);
			}
		}
	}

	/**
	 * Writes the collected updates once, in package-name order.
	 * Does not write the file if the catalog already contains the requested versions.
	 */
	public save(): void {
		let changed = false;
		for (const [name, version] of [...this.updates].sort(([a], [b]) => a.localeCompare(b))) {
			const keys = ["catalogs", this.catalogName, name];
			if (this.document.getIn(keys) !== version) {
				this.document.setIn(keys, version);
				changed = true;
			}
		}
		if (changed) {
			writeFileSync(
				this.yamlPath,
				this.document.toString().replace(/\n/g, this.newline),
				"utf-8",
			);
		}
	}
}

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
