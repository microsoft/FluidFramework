/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/** @typedef {import("@fluid-tools/api-markdown-documenter").ApiItem} ApiItem */
/** @typedef {import("@fluid-tools/api-markdown-documenter").ApiModel} ApiModel */
/** @typedef {import("@fluid-tools/api-markdown-documenter").ApiItemTransformationConfiguration} ApiItemTransformationConfiguration */
/** @typedef {import("../../src/apiLinkManifest.js").ApiLinkManifest} ApiLinkManifest */
/** @typedef {import("../../src/apiLinkManifest.js").ApiLinkManifestEntry} ApiLinkManifestEntry */
/** @typedef {import("../../src/apiLinkManifest.js").ApiLinkManifestPathSegment} ApiLinkManifestPathSegment */

import { ApiItemKind, ApiItemUtilities } from "@fluid-tools/api-markdown-documenter";

const unsupportedApiItemKinds = new Set([
	ApiItemKind.CallSignature,
	ApiItemKind.Constructor,
	ApiItemKind.ConstructSignature,
	ApiItemKind.EntryPoint,
	ApiItemKind.IndexSignature,
	ApiItemKind.Model,
	ApiItemKind.Package,
]);

/**
 * Generates an API link manifest from an API model.
 *
 * @param {ApiModel} apiModel - The model containing the API items to record.
 * @param {ApiItemTransformationConfiguration} config - The normalized configuration used to render the model.
 * @returns {ApiLinkManifest} The generated manifest.
 */
export function createApiLinkManifest(apiModel, config) {
	/** @type {ApiLinkManifest} */
	const manifest = {};
	/** @type {Map<string, { readonly canonicalReference: string; readonly target: import("@fluid-tools/api-markdown-documenter").ApiItemLinkTarget }>} */
	const existingCandidates = new Map();

	for (const apiPackage of apiModel.packages) {
		if (!ApiItemUtilities.shouldItemBeIncluded(apiPackage, config)) {
			continue;
		}

		const packageName = ApiItemUtilities.getUnscopedPackageName(apiPackage);
		if (manifest[packageName] !== undefined) {
			throw new Error(`Multiple API packages have the unscoped name "${packageName}".`);
		}

		/** @type {Record<string, ApiLinkManifestEntry[]>} */
		const packageManifest = {};
		manifest[packageName] = packageManifest;

		for (const entryPoint of apiPackage.entryPoints) {
			visitApiItem(entryPoint, packageName, packageManifest, []);
		}
	}

	return sortManifest(manifest);

	/**
	 * @param {ApiItem} apiItem - The item being visited.
	 * @param {string} packageName - The unscoped name of the containing package.
	 * @param {Record<string, ApiLinkManifestEntry[]>} packageManifest - The package manifest being populated.
	 * @param {ApiLinkManifestPathSegment[]} parentPath - The typed path segments of the item's documented ancestors.
	 */
	function visitApiItem(apiItem, packageName, packageManifest, parentPath) {
		if (!ApiItemUtilities.shouldItemBeIncluded(apiItem, config)) {
			return;
		}

		const shouldRecord = !unsupportedApiItemKinds.has(apiItem.kind);
		const overloadIndex = getOverloadIndex(apiItem);
		const path = shouldRecord
			? [
					...parentPath,
					{
						name: apiItem.displayName,
						apiType: apiItem.kind,
						...(overloadIndex === undefined ? {} : { overloadIndex }),
					},
				]
			: parentPath;

		if (shouldRecord) {
			const apiName = path.map((segment) => segment.name).join(".");
			const candidateKey = `${packageName}\0${JSON.stringify(path)}`;
			const canonicalReference = getCanonicalReference(apiItem);
			const target = ApiItemUtilities.getLinkTargetForApiItem(apiItem, config);
			const existingCandidate = existingCandidates.get(candidateKey);
			if (
				existingCandidate !== undefined &&
				(existingCandidate.target.documentPath !== target.documentPath ||
					existingCandidate.target.headingId !== target.headingId)
			) {
				throw new Error(
					`Duplicate API link candidate for "${packageName}/${apiName}" with path ${JSON.stringify(path)}. Canonical references: "${existingCandidate.canonicalReference}" and "${canonicalReference}".`,
				);
			}

			if (existingCandidate === undefined) {
				existingCandidates.set(candidateKey, { canonicalReference, target });
				const candidates = (packageManifest[apiName] ??= []);
				candidates.push({
					path,
					documentPath: target.documentPath,
					...(target.headingId === undefined ? {} : { headingId: target.headingId }),
				});
			}
		}

		for (const member of getMembers(apiItem)) {
			visitApiItem(member, packageName, packageManifest, path);
		}
	}
}

/**
 * @param {ApiItem} apiItem - The item whose members will be returned.
 * @returns {readonly ApiItem[]} The item's members, or an empty array when it is not a container.
 */
function getMembers(apiItem) {
	const members = /** @type {{ members?: unknown }} */ (apiItem).members;
	return Array.isArray(members) ? members : [];
}

/**
 * @param {ApiItem} apiItem - The item whose overload index will be returned.
 * @returns {number | undefined} The one-based overload index, when present.
 */
function getOverloadIndex(apiItem) {
	const overloadIndex = /** @type {{ overloadIndex?: unknown }} */ (apiItem).overloadIndex;
	return typeof overloadIndex === "number" ? overloadIndex : undefined;
}

/**
 * @param {ApiItem} apiItem - The item whose canonical reference will be returned.
 * @returns {string} A diagnostic representation of the item.
 */
function getCanonicalReference(apiItem) {
	const canonicalReference = /** @type {{ canonicalReference?: unknown }} */ (apiItem)
		.canonicalReference;
	return canonicalReference === undefined ? apiItem.displayName : String(canonicalReference);
}

/**
 * @param {ApiLinkManifest} manifest - The manifest to sort.
 * @returns {ApiLinkManifest} A deterministically ordered manifest.
 */
function sortManifest(manifest) {
	return Object.fromEntries(
		Object.entries(manifest)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([packageName, packageManifest]) => [
				packageName,
				Object.fromEntries(
					Object.entries(packageManifest)
						.sort(([left], [right]) => left.localeCompare(right))
						.map(([apiName, candidates]) => [
							apiName,
							candidates.toSorted((left, right) =>
								JSON.stringify(left.path).localeCompare(JSON.stringify(right.path)),
							),
						]),
				),
			]),
	);
}
