/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { WebApi } from "azure-devops-node-api";
import type JSZip from "jszip";
import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { unzipStream } from "../utilities/index.js";
import {
	type BundleFileData,
	getAnalyzerFilePathsFromFolder,
} from "./getBundleFilePathsFromFolder.js";

/**
 * Gets a list of `analyzer.json` paths from the zip archive (one per source package).
 * @param jsZip - A zip file that has been processed with the jszip library
 */
export function getAnalyzerPathsFromZipObject(jsZip: JSZip): BundleFileData[] {
	const relativePaths: string[] = [];
	jsZip.forEach((path) => {
		relativePaths.push(path);
	});

	return getAnalyzerFilePathsFromFolder(relativePaths);
}

/**
 * Downloads an Azure Devops artifacts and parses it with the jszip library.
 * @param adoConnection - A connection to the ADO api.
 * @param buildNumber - The ADO build number that contains the artifact we wish to fetch
 */
export async function getZipObjectFromArtifact(
	adoConnection: WebApi,
	projectName: string,
	buildNumber: number,
	artifactName: string,
): Promise<JSZip> {
	const buildApi = await adoConnection.getBuildApi();

	// IMPORTANT
	// getArtifactContentZip() in the azure-devops-node-api package tries to download pipeline artifacts using an
	// API version (in the http request's accept header) that isn't supported by the artifact download endpoint.
	// One way of getting around that is by temporarily removing the API version that the package adds, to force
	// it to use a supported one.
	// See https://github.com/microsoft/azure-devops-node-api/issues/432 for more details.
	const originalCreateAcceptHeader = buildApi.createAcceptHeader;
	buildApi.createAcceptHeader = (type: string): string => type;
	const artifactStream = await buildApi.getArtifactContentZip(
		projectName,
		buildNumber,
		artifactName,
	);
	// Undo hack from above
	buildApi.createAcceptHeader = originalCreateAcceptHeader;

	// We want our relative paths to be clean, so navigating JsZip into the top level folder
	const result = (await unzipStream(artifactStream)).folder(artifactName);
	assert(result, `getZipObjectFromArtifact could not find the folder ${artifactName}`);

	return result;
}

/**
 * Retrieves and parses an analyzer.json file (webpack-bundle-analyzer's
 * `analyzerMode: "json"` output) from a jszip object.
 * @param jsZip - A zip file that has been processed with the jszip library
 * @param relativePath - The relative path to the file that will be retrieved
 */
export async function getAnalyzerJsonFromZip(
	jsZip: JSZip,
	relativePath: string,
): Promise<BundleAnalyzerPlugin.JsonReport> {
	const jsZipObject = jsZip.file(relativePath);
	assert(jsZipObject, `getAnalyzerJsonFromZip could not find file ${relativePath}`);

	const text = await jsZipObject.async("string");
	return JSON.parse(text) as BundleAnalyzerPlugin.JsonReport;
}
