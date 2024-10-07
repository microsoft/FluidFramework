/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "fs-extra";

import ApiDocsVersions from "../api-docs-versions.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pre Docusaurus build script.
 * Generates configuration details required by Docusaurus that we can't define statically.
 */

// Generate the "versions.json" file that Docusaurus uses to determine which versions to display.
const versionsJsonPath = path.resolve(dirname, "..", "versions.json");
const versions = Object.entries(ApiDocsVersions).filter(([version, config]) => !config.current).map(([version]) => version);
await fs.writeFile(versionsJsonPath, JSON.stringify(versions))
