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
	const validKinds = new Set([
		ApiItemKind.Class,
		ApiItemKind.Interface,
		ApiItemKind.Enum,
		ApiItemKind.Namespace,
	]);
	const { allAPIs, packageMap } = documents.reduce(
		({ allAPIs, packageMap }, { apiItem }) => {
			if (apiItem === undefined) {
				return { allAPIs, packageMap };
			}

			const { displayName, kind } = apiItem;

			const associatedPackage = apiItem.getAssociatedPackage();
			const packageName =
				associatedPackage === undefined
					? undefined
					: ApiItemUtilities.getUnscopedPackageName(associatedPackage);

			if (kind === ApiItemKind.Package) {
				if (packageMap.hasOwnProperty(displayName)) {
					throw new Error("Package name collision!");
				}

				packageMap[displayName] = packageName;
			} else if (validKinds.has(kind)) {
				allAPIs[packageName] = allAPIs[packageName] || {};
				allAPIs[packageName][kind] = allAPIs[packageName][kind] || [];
				allAPIs[packageName][kind].push(displayName);
			}

			return { allAPIs, packageMap };
		},
		{ allAPIs: {}, packageMap: {} },
	);

	const results = await Promise.allSettled([
		saveToFile("allAPIs.yaml", allAPIs),
		saveToFile("packageNameToDisplayName.yaml", packageMap),
		saveToFile("displayNameToPackageName.yaml", invertMap(packageMap)),
	]);

	results.forEach((result, index) => {
		if (result.status === "rejected") {
			console.error(`Error saving file ${index}:`, result.reason);
		}
	});
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
