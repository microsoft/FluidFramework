/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: how will versioning interact with these?

/**
 * {@link PackageLink} input props.
 */
export interface PackageLinkProps {
	children?: React.ReactNode;
	packageName: string;
}

/**
 * A convenient mechanism for linking to a package's API documentation.
 */
export function PackageLink({ packageName, children }: PackageLinkProps): JSX.Element {
	return <a href={`/docs/api/${packageName}`}>{children}</a>;
}

/**
 * {@link ApiLink} input props.
 */
export interface ApiLinkProps {
	children?: React.ReactNode;
	packageName: string;
	apiName: string;
	// TODO: import directly from `api-extractor-model`
	apiType: "class" | "enum" | "function" | "interface" | "namespace" | "type" | "variable";
}

/**
 * A convenient mechanism for linking to the API documentation for a specified API item.
 */
export function ApiLink({ packageName, apiName, apiType, children }: ApiLinkProps): React.ReactElement {
	// TODO: how to deal with namespaces?
	const path = `/docs/api/${packageName}/${apiName}-${apiType}`;
	return <a href={path}>{children}</a>;
}


/**
 * {@link GlossaryLink} input props.
 */
export interface GlossaryLinkProps {
	/**
	 * The glossary term to link to.
	 */
	term: string;
}

/**
 * A convenient mechanism for linking to a defined glossary term.
 * @remarks Assumes that a heading exists for the specified term in `docs/glossary.md`.
 */
export function GlossaryLink({ term }: GlossaryLinkProps): JSX.Element {
	return <a href={`/docs/glossary#${term}`}>{term}</a>;
}
