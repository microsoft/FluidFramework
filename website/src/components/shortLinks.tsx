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

const emittedTransitionDiagnostics = new Set<string>();

/**
 * The package names used while API documentation transitions through a package rename.
 */
export interface PackageLinkRename {
	/**
	 * The package name in the current published API documentation.
	 */
	previous: string;

	/**
	 * The new package name that will replace {@link PackageLinkRename.previous}.
	 */
	new: string;
}

/**
 * {@link PackageLink} input props.
 */
export interface PackageLinkProps {
	/**
	 * Contents to display within the link.
	 * When omitted during a package rename, the new package name is displayed.
	 */
	children?: ReactNode;

	/**
	 * The unscoped package name, or the previous and new names for a staged package rename.
	 */
	package: string | PackageLinkRename;

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
	package: packageNameOrRename,
	children,
	newApi = false,
}: PackageLinkProps): JSX.Element {
	const rename = typeof packageNameOrRename === "string" ? undefined : packageNameOrRename;
	const packageName =
		typeof packageNameOrRename === "string"
			? packageNameOrRename
			: packageNameOrRename.previous;
	const newPackageName = rename?.new;
	const needsManifest = newApi || rename !== undefined;
	const { activeVersion, manifest } = useApiLinkContext("PackageLink", needsManifest);
	const root = `${activeVersion.path}/api/`;
	if (!needsManifest) {
		return <a href={`${root}${packageName}`}>{children ?? packageName}</a>;
	}

	if (manifest === undefined) {
		throw new Error(
			`No API link manifest found for documentation version "${activeVersion.name}".`,
		);
	}

	const defaultText = newPackageName ?? packageName;
	if (newPackageName !== undefined && manifest[newPackageName] !== undefined) {
		warnOnce(
			`PackageLink|rename|${activeVersion.name}|${newPackageName}`,
			`[PackageLink] New package name "${newPackageName}" exists in API documentation version "${activeVersion.name}". Set package="${newPackageName}".`,
		);
		return <a href={`${root}${newPackageName}`}>{children ?? defaultText}</a>;
	}

	if (manifest[packageName] !== undefined) {
		if (rename === undefined && newApi) {
			warnOnce(
				`PackageLink|newApi|${activeVersion.name}|${packageName}`,
				`[PackageLink] Package "${packageName}" exists in API documentation version "${activeVersion.name}". Remove the newApi prop.`,
			);
		} else if (newPackageName !== undefined) {
			debugOnce(
				`PackageLink|rename-fallback|${activeVersion.name}|${packageName}|${newPackageName}`,
				`[PackageLink] New package name "${newPackageName}" does not exist in API documentation version "${activeVersion.name}". Linking to previous package "${packageName}".`,
			);
		}
		return <a href={`${root}${packageName}`}>{children ?? defaultText}</a>;
	}

	if (newApi) {
		debugOnce(
			`PackageLink|code-fallback|${activeVersion.name}|${defaultText}`,
			`[PackageLink] New package "${defaultText}" does not exist in API documentation version "${activeVersion.name}". Rendering inline code placeholder.`,
		);
		return <code>{children ?? defaultText}</code>;
	}

	return <a href={`${root}${packageName}`}>{children ?? defaultText}</a>;
}

/**
 * The declaration references used while API documentation transitions through an API rename.
 */
export interface ApiLinkRename<
	TPreviousApiSelector extends string = string,
	TNewApiSelector extends string = string,
> {
	/**
	 * The API declaration reference in the current published API documentation.
	 */
	previous: ApiDeclarationReference<TPreviousApiSelector>;

	/**
	 * The new API declaration reference that will replace {@link ApiLinkRename.previous}.
	 */
	new: ApiDeclarationReference<TNewApiSelector>;
}

/**
 * {@link ApiLink} input props.
 */
export interface ApiLinkProps<
	TApiSelector extends string = string,
	TNewApiSelector extends string = string,
> {
	/**
	 * Contents to display within the link.
	 * When omitted, the resolved API declaration reference is displayed without selectors.
	 */
	children?: ReactNode;

	/**
	 * The unscoped name of the package containing the API item.
	 */
	package: string;

	/**
	 * A TSDoc-style declaration reference, or the previous and new references for a staged API
	 * rename.
	 */
	api: ApiDeclarationReference<TApiSelector> | ApiLinkRename<TApiSelector, TNewApiSelector>;

	/**
	 * Permits the API to be absent from the published API documentation.
	 *
	 * @remarks Remove this prop when the API documentation is available.
	 */
	newApi?: boolean;
}

/**
 * A convenient mechanism for linking to the API documentation for a specified API item.
 *
 * @throws If the requested API cannot be uniquely resolved in the active documentation version.
 */
export function ApiLink<const TApiSelector extends string, const TNewApiSelector extends string>({
	api: apiOrRename,
	package: packageName,
	newApi = false,
	children,
}: ApiLinkProps<TApiSelector, TNewApiSelector>): JSX.Element {
	const { activeVersion, manifest } = useApiLinkContext("ApiLink", true);
	if (manifest === undefined) {
		throw new Error(
			`No API link manifest found for documentation version "${activeVersion.name}".`,
		);
	}

	const rename = typeof apiOrRename === "string" ? undefined : apiOrRename;
	const api = typeof apiOrRename === "string" ? apiOrRename : apiOrRename.previous;
	const newApiReference = rename?.new;
	const replacementResult =
		newApiReference === undefined
			? undefined
			: tryResolveApiLinkTarget(manifest, packageName, newApiReference);
	const result = tryResolveApiLinkTarget(manifest, packageName, api);
	if (replacementResult?.found === true) {
		warnOnce(
			`ApiLink|rename|${activeVersion.name}|${packageName}|${newApiReference}`,
			`[ApiLink] New API name "${packageName}/${newApiReference}" exists in API documentation version "${activeVersion.name}". Set api="${newApiReference}".`,
		);
		return renderApiLink(
			activeVersion.path,
			replacementResult.target,
			children ?? replacementResult.defaultText,
		);
	}

	if (!result.found) {
		if (newApi) {
			const unresolvedApi = newApiReference ?? api;
			debugOnce(
				`ApiLink|code-fallback|${activeVersion.name}|${packageName}|${unresolvedApi}`,
				`[ApiLink] New API "${packageName}/${unresolvedApi}" does not exist in API documentation version "${activeVersion.name}". Rendering inline code placeholder.`,
			);
			return <code>{children ?? replacementResult?.defaultText ?? result.defaultText}</code>;
		}
		throw new Error(`No API documentation found for "${packageName}/${api}".`);
	}

	if (rename === undefined && newApi) {
		warnOnce(
			`ApiLink|newApi|${activeVersion.name}|${packageName}|${api}`,
			`[ApiLink] API "${packageName}/${api}" exists in API documentation version "${activeVersion.name}". Remove the newApi prop.`,
		);
	} else if (newApiReference !== undefined) {
		debugOnce(
			`ApiLink|rename-fallback|${activeVersion.name}|${packageName}|${api}|${newApiReference}`,
			`[ApiLink] New API name "${packageName}/${newApiReference}" does not exist in API documentation version "${activeVersion.name}". Linking to previous API "${packageName}/${api}".`,
		);
	}

	return renderApiLink(activeVersion.path, result.target, children ?? result.defaultText);
}

function renderApiLink(
	versionPath: string,
	target: { readonly documentPath: string; readonly headingId?: string },
	children: ReactNode,
): JSX.Element {
	const headingPostfix = target.headingId === undefined ? "" : `#${target.headingId}`;
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
	logOnce(key, message, console.warn);
}

function debugOnce(key: string, message: string): void {
	logOnce(key, message, console.debug);
}

function logOnce(key: string, message: string, log: (message: string) => void): void {
	if (typeof window !== "undefined" || emittedTransitionDiagnostics.has(key)) {
		return;
	}
	emittedTransitionDiagnostics.add(key);
	log(message);
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
