/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This Docusaurus plugin runs in Node.js while loading build-time content.
// eslint-disable-next-line import/no-nodejs-modules
import { readFile } from "node:fs/promises";

import type { Plugin } from "@docusaurus/types";

import {
	type ApiLinkManifest,
	type ApiLinkManifests,
	apiLinkManifestPluginName,
} from "../apiLinkManifest.js";
import type { SiteVersion } from "../utilityTypes.js";

export {
	type ApiLinkManifest,
	type ApiLinkManifests,
	apiLinkManifestPluginName,
} from "../apiLinkManifest.js";

export type ApiLinkManifestPaths = Readonly<Partial<Record<SiteVersion, string>>>;

/**
 * Creates a Docusaurus plugin that publishes API link manifests as global plugin data.
 *
 * @param manifestPaths - A mapping from Docusaurus documentation version names to generated manifest paths.
 */
export function apiLinkManifestPlugin(manifestPaths: ApiLinkManifestPaths): Plugin {
	return {
		name: apiLinkManifestPluginName,
		async loadContent(): Promise<ApiLinkManifests> {
			const manifests = await Promise.all(
				Object.entries(manifestPaths).map(async ([versionName, manifestPath]) => {
					if (manifestPath === undefined) {
						throw new Error(
							`No API link manifest path was configured for Docusaurus version "${versionName}".`,
						);
					}
					const manifest = JSON.parse(
						await readFile(manifestPath, "utf8"),
					) as Readonly<ApiLinkManifest>;
					return [versionName as SiteVersion, manifest] as const;
				}),
			);

			return Object.fromEntries(manifests);
		},
		contentLoaded({ content, actions }) {
			actions.setGlobalData(content);
		},
	};
}
