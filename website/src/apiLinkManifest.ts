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
 * One segment in an API item's documented containment path.
 */
export interface ApiLinkManifestPathSegment {
	/**
	 * The segment's author-facing API name.
	 */
	readonly name: string;

	/**
	 * The API Extractor item kind used to distinguish declarations that share this name.
	 */
	readonly apiType: ApiItemKind;

	/**
	 * The one-based API Extractor overload index used to distinguish overloads of this item.
	 * Omitted for API items that do not support overloads.
	 */
	readonly overloadIndex?: number;
}

/**
 * A possible documentation target for an API declaration reference.
 */
export interface ApiLinkManifestEntry {
	/**
	 * The API item's containment path, including the kind of every addressable segment.
	 */
	readonly path: readonly ApiLinkManifestPathSegment[];

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
 * unselected, dotted API path, such as `TreeView.upgradeSchema`. A path maps to an array because
 * kinds or overloads at any containment level can share the same names.
 */
export type ApiLinkManifest = Record<string, Record<string, ApiLinkManifestEntry[]>>;

/**
 * API link manifests keyed by Docusaurus documentation version name, such as `current`, `1`, or
 * `local`.
 */
export type ApiLinkManifests = Readonly<Partial<Record<SiteVersion, Readonly<ApiLinkManifest>>>>;
