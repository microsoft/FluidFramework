/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApiItemKind, ApiItemUtilities } from "@fluid-tools/api-markdown-documenter";

import fs from "fs-extra";
import path from "path";

/**
 * Processes documents and generates data required for the nav bar.
 * @param {Array<Object>} documents - List of {@link @fluid-tools/api-markdown-documenter#Document}s with associated API items.
 * @param {ApiItem | undefined} documents.apiItem - The API item that the document is created from. Some documents may not have an apiItem.
 */
export async function buildNavBar(documents, version) {
	const navKinds = new Set([
		ApiItemKind.Class,
		ApiItemKind.Interface,
		ApiItemKind.Enum,
		ApiItemKind.Namespace,
		ApiItemKind.TypeAlias,
	]);
	const apiItems = documents
		.map((document) => document.apiItem)
		.filter((apiItem) => apiItem !== undefined && apiItem.kind !== ApiItemKind.Model);

	const { allAPIs, packageMap } = apiItems.reduce(
		({ allAPIs, packageMap }, apiItem) => {
			const associatedPackage = apiItem.getAssociatedPackage();

			if (associatedPackage === undefined) {
				throw new Error(
					`Associated package is undefined for API item: ${apiItem.displayName}`,
				);
			}

			const packageName = ApiItemUtilities.getUnscopedPackageName(associatedPackage);

			const { displayName, kind } = apiItem;

			if (kind === ApiItemKind.Package) {
				if (packageMap.hasOwnProperty(displayName)) {
					throw new Error("Package name collision!");
				}
				packageMap[displayName] = packageName;
			} else if (navKinds.has(kind)) {
				allAPIs[packageName] = allAPIs[packageName] || {};
				allAPIs[packageName][kind] = allAPIs[packageName][kind] || [];
				allAPIs[packageName][kind].push(displayName);
			}

			return { allAPIs, packageMap };
		},
		{ allAPIs: {}, packageMap: {} },
	);

	return await Promise.all([
		saveToFile("allAPIs.json", version, allAPIs),
		saveToFile("packageNameToDisplayName.json", version, packageMap),
		saveToFile("displayNameToPackageName.json", version, invertMap(packageMap)),
	]);
}

const saveToFile = async (filename, version, data) => {
	if (!fs.existsSync(path.join(__dirname, "..", "data", version))) {
		fs.mkdirSync(path.join(__dirname, "..", "data", version), { recursive: true });
	}
	fs.writeFile(
		path.join(__dirname, "..", "data", `${version}/${filename}`),
		JSON.stringify(data, null, 2),
		"utf8",
	);
};

const invertMap = (obj) =>
	Object.entries(obj).reduce((acc, [key, value]) => {
		if (acc.hasOwnProperty(value)) {
			throw new Error("Package name collision!");
		}
		return { ...acc, [value]: key };
	}, {});
