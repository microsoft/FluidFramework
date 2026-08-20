/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItemKind } from "@fluid-tools/api-markdown-documenter";

import type { SiteVersion } from "./utilityTypes.js";

/**
 * The Docusaurus plugin name used to publish and retrieve API link manifest data.
 */
export const apiLinkManifestPluginName = "api-link-manifests";

/**
 * A possible documentation target for an API name in a generated API link manifest.
 */
export interface ApiLinkManifestEntry {
	/**
	 * The API Extractor item kind used to distinguish declarations that share a name.
	 */
	readonly apiType: ApiItemKind;

	/**
	 * The one-based API Extractor overload index used to distinguish overloads of the same kind.
	 * Omitted for API items that do not support overloads.
	 */
	readonly overloadIndex?: number;

	/**
	 * The extension-less path of the generated document, relative to the API documentation URI root.
	 */
	readonly documentPath: string;

	/**
	 * The heading fragment when the API item is rendered as a section within its document.
	 */
	readonly headingId?: string;
}

/**
 * Link targets for one version of the generated API documentation.
 *
 * The outer record is keyed by unscoped package name. Each package record is keyed by the
 * qualified, author-facing API name, such as `TreeView.upgradeSchema`. A name maps to an array
 * because different API item kinds or overloads can share that name.
 */
export type ApiLinkManifest = Readonly<
	Record<string, Readonly<Record<string, readonly ApiLinkManifestEntry[]>>>
>;

/**
 * API link manifests keyed by Docusaurus documentation version name, such as `current`, `1`, or
 * `local`.
 */
export type ApiLinkManifests = Readonly<Partial<Record<SiteVersion, ApiLinkManifest>>>;
