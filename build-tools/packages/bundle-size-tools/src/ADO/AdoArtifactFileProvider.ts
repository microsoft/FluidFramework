/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { WebApi } from "azure-devops-node-api";
import type { StatsCompilation } from "webpack";

import type { BundleBuddyConfig } from "../BundleBuddyTypes";
import { type UnzippedContents, decompressStatsFile, unzipStream } from "../utilities";
import {
	type BundleFileData,
	getBundleFilePathsFromFolder,
} from "./getBundleFilePathsFromFolder";

/**
 * Gets a list of all paths relevant to bundle buddy from the unzipped archive
 * @param files - The unzipped archive contents as a Map of paths to Buffers
 */
export function getBundlePathsFromZipObject(files: UnzippedContents): BundleFileData[] {
	const relativePaths: string[] = [...files.keys()];
	return getBundleFilePathsFromFolder(relativePaths);
}

/**
 * Downloads an Azure Devops artifacts and unzips it.
 * @param adoConnection - A connection to the ADO api.
 * @param buildNumber - The ADO build number that contains the artifact we wish to fetch
 * @returns A Map of file paths to their contents as Buffers
 */
export async function getZipObjectFromArtifact(
	adoConnection: WebApi,
	projectName: string,
	buildNumber: number,
	bundleAnalysisArtifactName: string,
): Promise<UnzippedContents> {
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
		bundleAnalysisArtifactName,
	);
	// Undo hack from above
	buildApi.createAcceptHeader = originalCreateAcceptHeader;

	// We want our relative paths to be clean, so filter to files within the artifact folder
	const result = await unzipStream(artifactStream, bundleAnalysisArtifactName);
	assert(
		result.size > 0,
		`getZipObjectFromArtifact could not find the folder ${bundleAnalysisArtifactName}`,
	);

	return result;
}

/**
 * Retrieves a decompressed stats file from an unzipped archive
 * @param files - The unzipped archive contents as a Map of paths to Buffers
 * @param relativePath - The relative path to the file that will be retrieved
 */
export async function getStatsFileFromZip(
	files: UnzippedContents,
	relativePath: string,
): Promise<StatsCompilation> {
	const buffer = files.get(relativePath);
	assert(buffer, `getStatsFileFromZip could not find file ${relativePath}`);

	return decompressStatsFile(buffer);
}

/**
 * Retrieves and parses a bundle buddy config file from an unzipped archive
 * @param files - The unzipped archive contents as a Map of paths to Buffers
 * @param relativePath - The relative path to the file that will be retrieved
 */
export async function getBundleBuddyConfigFileFromZip(
	files: UnzippedContents,
	relativePath: string,
): Promise<BundleBuddyConfig> {
	const buffer = files.get(relativePath);
	assert(buffer, `getBundleBuddyConfigFileFromZip could not find file ${relativePath}`);

	return JSON.parse(buffer.toString());
}
