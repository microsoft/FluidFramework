/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

async function getPackage() {
	const executedDir = process.cwd();
	const pkgString = fs.readFileSync(`${executedDir}/package.json`);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return JSON.parse(pkgString as any);
}

const localhostURL = "http://localhost:8080/";

async function getFilePath() {
	const pkg = await getPackage();
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return pkg.fluid.browser.umd.files[0];
}

async function createManifest() {
	const pkg = await getPackage();

	const manifest = {
		id: pkg.name,
		experimentalData: {
			fluid: true,
		},
		loaderConfig: {
			entryModuleId: "main",
			internalModuleBaseUrls: [localhostURL],
			scriptResources: {
				"fluid.main": {
					path: await getFilePath(),
				},
			},
		},
		preconfiguredEntries: [
			{
				title: {
					default: pkg.name,
				},
				description: {
					default: pkg.description,
				},
			},
		],
	};
	return {
		Manifest: JSON.stringify(manifest),
	};
}

export async function createManifestResponse() {
	const response = { d: { GetClientSideWebParts: { results: [await createManifest()] } } };
	return response;
}
