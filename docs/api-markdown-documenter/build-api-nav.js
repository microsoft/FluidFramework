/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { ApiItemKind, ApiItemUtilities } = require("@fluid-tools/api-markdown-documenter");

const fs = require("fs-extra");
const path = require("path");
const yaml = require("js-yaml");

/**
 * Processes documents and generates data required for the nav bar.
 * @param {Array<Object>} documents - List of {@link @fluid-tools/api-markdown-documenter#Document}s with associated API items.
 * @param {ApiItem | undefined} documents.apiItem - The API item that the document is created from. Some documents may not have an apiItem.
 */
async function buildNavBar(documents) {
	const navKinds = new Set([
		ApiItemKind.Class,
		ApiItemKind.Interface,
		ApiItemKind.Enum,
		ApiItemKind.Namespace,
	]);
	const apiItems = documents
		.map((document) => document.apiItem)
		.filter((apiItem) => apiItem !== undefined && apiItem.kind !== ApiItemKind.Model);

	const { allAPIs, packageMap } = apiItems.reduce(
		({ allAPIs, packageMap }, apiItem) => {
			const associatedPackage = apiItem.getAssociatedPackage();

			if (associatedPackage === undefined) {
				throw new Error(`Associated package is undefined for API item: ${apiItem.displayName}`);
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
		saveToFile("allAPIs.yaml", allAPIs),
		saveToFile("packageNameToDisplayName.yaml", packageMap),
		saveToFile("displayNameToPackageName.yaml", invertMap(packageMap)),
	]);
}

const saveToFile = async (filename, data) =>
	fs.writeFile(path.join(__dirname, "..", "data", filename), yaml.dump(data), "utf8");

const invertMap = (obj) =>
	Object.entries(obj).reduce((acc, [key, value]) => {
		if (acc.hasOwnProperty(value)) {
			throw new Error("Package name collision!");
		}
		return { ...acc, [value]: key };
	}, {});

module.exports = {
	buildNavBar,
};
