/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Configuration for docs versions included in the website build.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const downloadedDocModelsDirectoryPath = path.resolve(dirname, "..", ".doc-models");
const currentDocsPath = path.resolve(dirname, "..", "docs");
const versionedDocsPath = path.resolve(dirname, "..", "versioned_docs");

/**
 * Path to the directory where API link manifests are generated and stored.
 * These manifests are used to generate links between API docs for different versions of the docs.
 */
const apiLinkManifestsPath = path.resolve(dirname, "..", ".generated", "api-link-manifests");

const config = {
	// Current version of the site.
	// Served under `/docs`.
	currentVersion: {
		version: "2",
		label: "v2",
		// Designates this version of the docs as the "current" version, and therefore the default version to display.
		current: true,
		apiDocs: {
			inputPath: path.resolve(downloadedDocModelsDirectoryPath, "v2"),
			manifestPath: path.resolve(apiLinkManifestsPath, "v2.json"),
			outputPath: path.resolve(currentDocsPath, "api"),
			uriRoot: "/docs/api",
		},
	},

	// Other site versions to include in the build.
	// Served under `/docs/<path>`.
	otherVersions: [
		{
			version: "1",
			label: "v1",
			path: "v1",
			apiDocs: {
				inputPath: path.resolve(downloadedDocModelsDirectoryPath, "v1"),
				manifestPath: path.resolve(apiLinkManifestsPath, "v1.json"),
				outputPath: path.resolve(versionedDocsPath, "version-1", "api"),
				uriRoot: "/docs/v1/api",
			},
			maintained: true,
		},
	],

	// Special config for local API docs mode.
	// Served under `/docs/local` (per "path" config below).
	local: {
		version: "local",
		label: "Local API Documentation",
		path: "local",
		apiDocs: {
			inputPath: path.resolve(dirname, "..", "..", "_api-extractor-temp", "doc-models"),
			manifestPath: path.resolve(apiLinkManifestsPath, "local.json"),
			outputPath: path.resolve(versionedDocsPath, "version-local", "api"),
			uriRoot: "/docs/local/api",
		},
	},
};

export default config;
