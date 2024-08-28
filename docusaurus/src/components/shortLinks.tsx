/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	const headingPostfix = headingId ? `#${headingId}` : "";
	return <a href={`/docs/api/${packageName}${headingPostfix}`}>{children ?? packageName}</a>;
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
	const headingPostfix = headingId ? `#${headingId}` : "";
	// TODO: how to deal with namespaces?
	const path = `/docs/api/${packageName}/${apiName}-${apiType}${headingPostfix}`;
	return <a href={path}>{children ?? apiName}</a>;
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
