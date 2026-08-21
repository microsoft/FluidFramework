/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useActivePluginAndVersion, useDoc } from "@docusaurus/plugin-content-docs/client";
import { usePluginData } from "@docusaurus/useGlobalData";
import type { ReactNode } from "react";

import { type ApiLinkManifests, apiLinkManifestPluginName } from "../apiLinkManifest";
import { type ApiDeclarationReference, resolveApiLinkTarget } from "../apiLinkReference";
import type { SiteVersion } from "../utilityTypes";

// TODO: how will versioning interact with these?

/**
 * {@link PackageLink} input props.
 */
export interface PackageLinkProps {
	/**
	 * Contents to display within the link.
	 * @defaultValue {@link PackageLinkProps.package}
	 */
	children?: ReactNode;

	/**
	 * The unscoped name of the package whose API documentation is linked.
	 */
	package: string;

	headingId?: string;
}

/**
 * A convenient mechanism for linking to a package's API documentation.
 */
export function PackageLink({
	headingId,
	package: packageName,
	children,
}: PackageLinkProps): JSX.Element {
	const root = useLinkPathBase();
	const headingPostfix = headingId === undefined ? "" : `#${headingId}`;
	return <a href={`${root}${packageName}${headingPostfix}`}>{children ?? packageName}</a>;
}

/**
 * {@link ApiLink} input props.
 */
export interface ApiLinkProps<TApiSelector extends string = string> {
	/**
	 * Contents to display within the link.
	 * When omitted, the API declaration reference is displayed without selectors.
	 *
	 * @defaultValue {@link ApiLinkProps.api}
	 */
	children?: ReactNode;

	/**
	 * The unscoped name of the package containing the API item.
	 */
	package: string;

	/**
	 * A TSDoc-style declaration reference identifying the API item within the package.
	 */
	api: ApiDeclarationReference<TApiSelector>;

	/**
	 * Overrides the generated heading ID for the target API item.
	 *
	 * @deprecated Use a qualified {@link ApiLinkProps.api} reference to link directly to a member.
	 */
	headingId?: string;
}

/**
 * A convenient mechanism for linking to the API documentation for a specified API item.
 *
 * @throws If the requested API cannot be uniquely resolved in the active documentation version.
 */
export function ApiLink<const TApiSelector extends string>({
	api,
	package: packageName,
	headingId,
	children,
}: ApiLinkProps<TApiSelector>): JSX.Element {
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

	const { target, defaultText } = resolveApiLinkTarget(manifest, packageName, api);
	const targetHeadingId = headingId ?? target.headingId;
	const headingPostfix = targetHeadingId === undefined ? "" : `#${targetHeadingId}`;
	return (
		<a href={`${activeVersion.path}/api/${target.documentPath}${headingPostfix}`}>
			{children ?? defaultText}
		</a>
	);
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
