/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useDoc } from "@docusaurus/plugin-content-docs/client";
import React from "react";

// TODO: how will versioning interact with these?

/**
 * {@link PackageLink} input props.
 */
export interface PackageLinkProps {
	/**
	 * Contents to display within the link.
	 * @defaultValue {@link PackageLinkProps.packageName}
	 */
	children?: React.ReactNode;
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
	children?: React.ReactNode;
	packageName: string;
	apiName: string;
	// TODO: import directly from `api-extractor-model`
	// TODO: do we have enough context to determine this automatically when unambiguous?
	apiType: "class" | "enum" | "function" | "interface" | "namespace" | "type" | "variable";

	/**
	 * (Optional) heading ID on the target page to link to.
	 *
	 * @remarks
	 * This is useful for linking to a particular member of an API item, if that member is rendered to its parent item's page.
	 *
	 * @privateRemarks
	 * TODO: in the future, it would be better to consume aspects of the API docs config, and automatically derive
	 * the right path to link to any kind of API item, regardless of whether or not it is configured to render to its
	 * own page or its parents.
	 * This would also be much more resilient to changes in the API docs config.
	 */
	headingId?: string;
}

/**
 * A convenient mechanism for linking to the API documentation for a specified API item.
 */
export function ApiLink({
	apiName,
	apiType,
	packageName,
	headingId,
	children,
}: ApiLinkProps): JSX.Element {
	const root = useLinkPathBase();
	const headingPostfix = headingId === undefined ? "" : `#${headingId}`;
	const path = `${root}${packageName}/${apiName.toLocaleLowerCase()}-${apiType}${headingPostfix}`;
	return <a href={path}>{children ?? apiName}</a>;
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
	children?: React.ReactNode;

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
