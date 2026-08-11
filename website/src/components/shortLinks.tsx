/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type GlobalDoc,
	useActivePluginAndVersion,
	useDoc,
} from "@docusaurus/plugin-content-docs/client";
import type { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import type { ReactNode } from "react";

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
 *
 * @throws
 * If {@link ApiLinkProps.apiType} is omitted and multiple API item kinds with the specified name are exported by the package.
 *
 * @privateRemarks
 * TODOs:
 * - Allow version overrides for cases where a user wants to link to a different version than the current one.
 * - Allow linking to API items that are rendered to their parent item's page. (Currently this is done via page headings.)
 * - Allow linking to child members of namespaces, classes, interfaces, etc. (Currently this is done via page headings,
 * but it would be better to consume aspects of the API docs config and automatically derive the right path to link to
 * any kind of API item, regardless of whether or not it is configured to render to its own page or its parents.
 * Additionally, there is currently no way to link items are rendered in sub-directories of their parent item, e.g.
 * children of namespaces.)
 */
export function ApiLink({
	apiName,
	apiType,
	packageName,
	headingId,
	children,
}: ApiLinkProps): JSX.Element {
	const activePluginAndVersion = useActivePluginAndVersion();
	const activeVersion = activePluginAndVersion?.activeVersion;
	if (activeVersion === undefined) {
		throw new Error("ApiLink must be rendered within a versioned Docusaurus document.");
	}

	const apiDocument = resolveApiDocument(activeVersion.docs, packageName, apiName, apiType);
	const headingPostfix = headingId === undefined ? "" : `#${headingId}`;
	return <a href={`${apiDocument.path}${headingPostfix}`}>{children ?? apiName}</a>;
}

/**
 * Resolves the Docusaurus document for an API item in a particular documentation version.
 *
 * @param documents - All documents registered for the active Docusaurus documentation version.
 * @param packageName - The unscoped package name used as the package directory in the generated API docs.
 * @param apiName - The exported API item name.
 * @param apiType - The API item kind. When omitted, the name must identify exactly one document in the package.
 * @returns The matching Docusaurus document, whose path includes the active documentation version.
 *
 * @throws If no document matches the package, name, and optional API item kind.
 * @throws If {@link apiType} is omitted and the package contains multiple API item kinds with the same name.
 *
 * @remarks
 * API Markdown document IDs follow the pattern `api/<package>/<lowercase-name>-<lowercase-kind>`.
 * Resolution uses document IDs rather than paths because IDs are stable across documentation versions, while
 * Docusaurus supplies the correctly versioned path on the returned document.
 */
function resolveApiDocument(
	documents: GlobalDoc[],
	packageName: string,
	apiName: string,
	apiType: ApiItemKind | undefined,
): GlobalDoc {
	const documentIdPrefix = `api/${packageName}/${apiName.toLowerCase()}-`;
	const candidates = documents.filter(
		(document) =>
			document.id.startsWith(documentIdPrefix) &&
			// Exclude descendants of folders (e.g. for namespaces) whose qualified name shares this prefix.
			!document.id.slice(documentIdPrefix.length).includes("/"),
	);

	if (apiType !== undefined) {
		const documentId = `${documentIdPrefix}${apiType.toLocaleLowerCase()}`;
		const match = candidates.find((document) => document.id === documentId);
		if (match !== undefined) {
			return match;
		}
		throw new Error(
			`No API documentation found for "${packageName}/${apiName}" with type "${apiType}".`,
		);
	}

	const firstCandidate = candidates[0];
	if (firstCandidate === undefined) {
		throw new Error(`No API documentation found for "${packageName}/${apiName}".`);
	}
	if (candidates.length === 1) {
		return firstCandidate;
	}

	const candidateTypes = candidates
		// The portion after the qualified-name prefix is the lowercase API item kind.
		.map((document) => document.id.slice(documentIdPrefix.length))
		.join(", ");
	throw new Error(
		`Multiple API documents found for "${packageName}/${apiName}" (${candidateTypes}). Specify \`apiType\` to disambiguate the link.`,
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
