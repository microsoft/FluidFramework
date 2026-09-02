/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type GlobalVersion,
	useActivePluginAndVersion,
} from "@docusaurus/plugin-content-docs/client";
import { usePluginData } from "@docusaurus/useGlobalData";
import type { ReactNode } from "react";

import { type ApiLinkManifests, apiLinkManifestPluginName } from "../apiLinkManifest";
import { type ApiDeclarationReference, tryResolveApiLinkTarget } from "../apiLinkReference";
import type { SiteVersion } from "../utilityTypes";

const emittedTransitionWarnings = new Set<string>();

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

	/**
	 * The new unscoped package name after a package rename.
	 *
	 * @remarks Remove this prop and update {@link PackageLinkProps.package} when the new package API
	 * documentation is available.
	 */
	replacementPackage?: string;

	headingId?: string;

	/**
	 * Permits the package to be absent from the published API documentation.
	 *
	 * @remarks Remove this prop when the package API documentation is available.
	 */
	newApi?: boolean;
}

/**
 * A convenient mechanism for linking to a package's API documentation.
 */
export function PackageLink({
	headingId,
	package: packageName,
	replacementPackage,
	children,
	newApi = false,
}: PackageLinkProps): JSX.Element {
	const needsManifest = newApi || replacementPackage !== undefined;
	const { activeVersion, manifest } = useApiLinkContext("PackageLink", needsManifest);
	const root = `${activeVersion.path}/api/`;
	const headingPostfix = headingId === undefined ? "" : `#${headingId}`;
	if (!needsManifest) {
		return <a href={`${root}${packageName}${headingPostfix}`}>{children ?? packageName}</a>;
	}

	if (manifest === undefined) {
		throw new Error(
			`No API link manifest found for documentation version "${activeVersion.name}".`,
		);
	}

	const defaultText = replacementPackage ?? packageName;
	if (replacementPackage !== undefined && manifest[replacementPackage] !== undefined) {
		warnOnce(
			`PackageLink|replacementPackage|${activeVersion.name}|${replacementPackage}`,
			`[PackageLink] Replacement package "${replacementPackage}" exists in API documentation version "${activeVersion.name}". Set package="${replacementPackage}" and remove the replacementPackage prop.`,
		);
		return (
			<a href={`${root}${replacementPackage}${headingPostfix}`}>{children ?? defaultText}</a>
		);
	}

	if (manifest[packageName] !== undefined) {
		if (replacementPackage === undefined && newApi) {
			warnOnce(
				`PackageLink|newApi|${activeVersion.name}|${packageName}`,
				`[PackageLink] Package "${packageName}" exists in API documentation version "${activeVersion.name}". Remove the newApi prop.`,
			);
		}
		return <a href={`${root}${packageName}${headingPostfix}`}>{children ?? defaultText}</a>;
	}

	if (newApi) {
		return <code>{children ?? defaultText}</code>;
	}

	return <a href={`${root}${packageName}${headingPostfix}`}>{children ?? defaultText}</a>;
}

/**
 * {@link ApiLink} input props.
 */
export interface ApiLinkProps<
	TApiSelector extends string = string,
	TReplacementApiSelector extends string = string,
> {
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
	 * The declaration reference for the API after a rename.
	 *
	 * @remarks Remove this prop and update {@link ApiLinkProps.api} when the replacement API
	 * documentation is available.
	 */
	replacementApi?: ApiDeclarationReference<TReplacementApiSelector>;

	/**
	 * Permits the API to be absent from the published API documentation.
	 *
	 * @remarks Remove this prop when the API documentation is available.
	 */
	newApi?: boolean;

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
export function ApiLink<
	const TApiSelector extends string,
	const TReplacementApiSelector extends string,
>({
	api,
	package: packageName,
	replacementApi,
	newApi = false,
	headingId,
	children,
}: ApiLinkProps<TApiSelector, TReplacementApiSelector>): JSX.Element {
	const { activeVersion, manifest } = useApiLinkContext("ApiLink", true);
	if (manifest === undefined) {
		throw new Error(
			`No API link manifest found for documentation version "${activeVersion.name}".`,
		);
	}

	const replacementResult =
		replacementApi === undefined
			? undefined
			: tryResolveApiLinkTarget(manifest, packageName, replacementApi);
	const result = tryResolveApiLinkTarget(manifest, packageName, api);
	if (replacementResult?.found === true) {
		warnOnce(
			`ApiLink|replacementApi|${activeVersion.name}|${packageName}|${replacementApi}`,
			`[ApiLink] Replacement API "${packageName}/${replacementApi}" exists in API documentation version "${activeVersion.name}". Set api="${replacementApi}" and remove the replacementApi prop.`,
		);
		return renderApiLink(
			activeVersion.path,
			replacementResult.target,
			headingId,
			children ?? replacementResult.defaultText,
		);
	}

	const defaultText = replacementResult?.defaultText ?? result.defaultText;
	if (!result.found) {
		if (newApi) {
			return <code>{children ?? defaultText}</code>;
		}
		throw new Error(`No API documentation found for "${packageName}/${api}".`);
	}

	if (replacementApi === undefined && newApi) {
		warnOnce(
			`ApiLink|newApi|${activeVersion.name}|${packageName}|${api}`,
			`[ApiLink] API "${packageName}/${api}" exists in API documentation version "${activeVersion.name}". Remove the newApi prop.`,
		);
	}

	return renderApiLink(activeVersion.path, result.target, headingId, children ?? defaultText);
}

function renderApiLink(
	versionPath: string,
	target: { readonly documentPath: string; readonly headingId?: string },
	headingId: string | undefined,
	children: ReactNode,
): JSX.Element {
	const targetHeadingId = headingId ?? target.headingId;
	const headingPostfix = targetHeadingId === undefined ? "" : `#${targetHeadingId}`;
	return <a href={`${versionPath}/api/${target.documentPath}${headingPostfix}`}>{children}</a>;
}

function useApiLinkContext(
	componentName: "ApiLink" | "PackageLink",
	requireManifest: boolean,
): {
	readonly activeVersion: GlobalVersion;
	readonly manifest: ApiLinkManifests[SiteVersion] | undefined;
} {
	const activeVersion = useActivePluginAndVersion()?.activeVersion;
	const manifests = usePluginData(apiLinkManifestPluginName, undefined, {
		failfast: requireManifest,
	}) as ApiLinkManifests | undefined;
	if (activeVersion === undefined) {
		throw new Error(
			`${componentName} must be rendered within a versioned Docusaurus document.`,
		);
	}

	const manifest = manifests?.[activeVersion.name as SiteVersion];
	if (requireManifest && manifest === undefined) {
		throw new Error(
			`No API link manifest found for documentation version "${activeVersion.name}".`,
		);
	}
	return { activeVersion, manifest };
}

function warnOnce(key: string, message: string): void {
	if (typeof window !== "undefined" || emittedTransitionWarnings.has(key)) {
		return;
	}
	emittedTransitionWarnings.add(key);
	console.warn(message);
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
