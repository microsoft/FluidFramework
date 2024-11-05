/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generates the `versions.json` file used by Docusaurus to determine which versions of the site to include in the build.
 * We generate this dynamically so that developers can opt into include local API documentation via the `LOCAL_API_DOCS` environment variable.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "fs-extra";

import DocsVersions from "../config/docs-versions.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const includeLocalApiDocs = process.env.LOCAL_API_DOCS === "true";

// Get versions from config
const versions = [];
// Note: don't include "current" version, because Docusaurus will automatically include `/docs`.
versions.push(...DocsVersions.otherVersions.map((v) => v.version));

if (includeLocalApiDocs) {
	versions.push(DocsVersions.local.version);
}

const versionsFilePath = path.resolve(dirname, "..", "versions.json");
await fs.writeJSON(versionsFilePath, versions);
