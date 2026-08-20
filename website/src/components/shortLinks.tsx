/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useActivePluginAndVersion, useDoc } from "@docusaurus/plugin-content-docs/client";
import { usePluginData } from "@docusaurus/useGlobalData";
import type { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import type { ReactNode } from "react";

import {
	type ApiLinkManifest,
	type ApiLinkManifestEntry,
	type ApiLinkManifests,
	apiLinkManifestPluginName,
} from "../apiLinkManifest";
import type { SiteVersion } from "../utilityTypes";

// TODO: how will versioning interact with these?

/**
 * {@link PackageLink} input props.
 */
export interface PackageLinkProps {
	/**
	 * Contents to display within the link.
	 * @defaultValue {@link PackageLinkProps.packageName}
	 */
	children?: ReactNode;
	packageName: string;
	headingId?: string;
}

/**
 * A convenient mechanism for linking to a package's API documentation.
 */
export function PackageLink({ headingId, packageName, children }: PackageLinkProps): JSX.Element {
	const root = useLinkPathBase();
	const headingPostfix = headingId === undefined ? "" : `#${headingId}`;
	return <a href={`${root}${packageName}${headingPostfix}`}>{children ?? packageName}</a>;
}

/**
 * {@link ApiLink} input props.
 */
export interface ApiLinkProps {
	/**
	 * Contents to display within the link.
	 * @defaultValue {@link ApiLinkProps.apiName}
	 */
	children?: ReactNode;
	packageName: string;
	apiName: string;
	/**
	 * The kind of API item to link to.
	 *
	 * @remarks
	 * May be omitted when the package exports only one API item with the specified name.
	 *
	 * {@link ApiLink} will throw an error if this is omitted and multiple API item kinds with the specified name are exported by the package.
	 */
	apiType?: ApiItemKind;

	/**
	 * The one-based overload index of the API item to link to.
	 */
	overloadIndex?: number;

	/**
	 * Overrides the generated heading ID for the target API item.
	 *
	 * @deprecated Use a qualified {@link ApiLinkProps.apiName} to link directly to a member.
	 */
	headingId?: string;
}

/**
 * A convenient mechanism for linking to the API documentation for a specified API item.
 *
 * @throws If the requested API cannot be uniquely resolved in the active documentation version.
 */
export function ApiLink({
	apiName,
	apiType,
	overloadIndex,
	packageName,
	headingId,
	children,
}: ApiLinkProps): JSX.Element {
	const activePluginAndVersion = useActivePluginAndVersion();
	const manifests = usePluginData(apiLinkManifestPluginName, undefined, {
		failfast: true,
	}) as ApiLinkManifests;
	const activeVersion = activePluginAndVersion?.activeVersion;
	if (activeVersion === undefined) {
		throw new Error("ApiLink must be rendered within a versioned Docusaurus document.");
	}

	const manifest = manifests[activeVersion.name as SiteVersion];
	if (manifest === undefined) {
		throw new Error(
			`No API link manifest found for documentation version "${activeVersion.name}".`,
		);
	}

	const target = resolveApiLinkTarget(manifest, packageName, apiName, apiType, overloadIndex);
	const targetHeadingId = headingId ?? target.headingId;
	const headingPostfix = targetHeadingId === undefined ? "" : `#${targetHeadingId}`;
	return (
		<a href={`${activeVersion.path}/api/${target.documentPath}${headingPostfix}`}>
			{children ?? apiName}
		</a>
	);
}

/**
 * Resolves an API item target from one version's API link manifest.
 *
 * @param manifest - The active documentation version's API link manifest.
 * @param packageName - The unscoped package name containing the API item.
 * @param apiName - The qualified, author-facing API item name.
 * @param apiType - The API item kind used to disambiguate declarations with the same name.
 * @param overloadIndex - The one-based overload index to select.
 * @returns The uniquely resolved manifest entry.
 */
function resolveApiLinkTarget(
	manifest: ApiLinkManifest,
	packageName: string,
	apiName: string,
	apiType: ApiItemKind | undefined,
	overloadIndex: number | undefined,
): ApiLinkManifestEntry {
	const candidates = manifest[packageName]?.[apiName];
	if (candidates === undefined) {
		throw new Error(`No API documentation found for "${packageName}/${apiName}".`);
	}

	const kindCandidates =
		apiType === undefined
			? candidates
			: candidates.filter((candidate) => candidate.apiType === apiType);
	if (kindCandidates.length === 0) {
		throw new Error(
			`No API documentation found for "${packageName}/${apiName}" with type "${apiType}".`,
		);
	}

	const availableKinds = [...new Set(kindCandidates.map((candidate) => candidate.apiType))];
	if (availableKinds.length > 1) {
		throw new Error(
			`API "${apiName}" in package "${packageName}" is ambiguous. Specify \`apiType\`. Available kinds: ${availableKinds.join(", ")}.`,
		);
	}

	if (overloadIndex !== undefined) {
		const overload = kindCandidates.find(
			(candidate) => candidate.overloadIndex === overloadIndex,
		);
		if (overload === undefined) {
			throw new Error(
				`No API documentation found for "${packageName}/${apiName}" with overload index ${overloadIndex}.`,
			);
		}
		return overload;
	}

	const target =
		kindCandidates.find((candidate) => candidate.overloadIndex === 1) ?? kindCandidates[0];
	if (target === undefined) {
		throw new Error(`No API documentation found for "${packageName}/${apiName}".`);
	}
	return target;
}

/**
 * Gets the base URI for a link to API docs.
 * Accounts for versioning.
 */
function useLinkPathBase(): string {
	const docContext = useDoc();
	const version = docContext.metadata.version;
	return `/docs/${version === "current" ? "" : `v${version}/`}api/`;
}

/**
 * {@link GlossaryLink} input props.
 */
export interface GlossaryLinkProps {
	/**
	 * Contents to display within the link.
	 * @defaultValue {@link GlossaryLinkProps.term}
	 */
	children?: ReactNode;

	/**
	 * The glossary term to link to.
	 */
	term: string;
}

/**
 * A convenient mechanism for linking to a defined glossary term.
 * @remarks Assumes that a heading exists for the specified term in `docs/glossary.md`.
 */
export function GlossaryLink({ term, children }: GlossaryLinkProps): JSX.Element {
	const termHeading = term.toLowerCase().replace(/\s+/g, "-");
	return <a href={`/docs/glossary#${termHeading}`}>{children ?? term}</a>;
}
