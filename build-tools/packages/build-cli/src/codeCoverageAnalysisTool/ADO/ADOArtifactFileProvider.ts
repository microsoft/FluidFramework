/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import { WebApi } from "azure-devops-node-api";
import JSZip from "jszip";
import { unzipStream } from "./utils.js";

/**
 * Downloads an Azure Devops artifacts and parses it with the jszip library.
 * @param adoConnection - A connection to the ADO api.
 * @param buildNumber - The ADO build number that contains the artifact we wish to fetch
 * @param artifactName - Name of the artifact to download
 * @param projectName - Name of the project that contains the build
 */
export async function getZipObjectFromArtifact(
	adoConnection: WebApi,
	buildNumber: number,
	artifactName: string,
	projectName: string,
): Promise<JSZip> {
	const buildApi = await adoConnection.getBuildApi();

	// IMPORTANT
	// getArtifactContentZip() in the azure-devops-node-api package tries to download pipeline artifacts using an
	// API version (in the http request's accept header) that isn't supported by the artifact download endpoint.
	// One way of getting around that is by temporarily removing the API version that the package adds, to force
	// it to use a supported one.
	// See https://github.com/microsoft/azure-devops-node-api/issues/432 for more details.
	// eslint-disable-next-line @typescript-eslint/unbound-method
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
	const unzippedStream = await unzipStream(artifactStream);
	const result = unzippedStream.folder(artifactName);
	assert(result, `getZipObjectFromArtifact could not find the folder ${artifactName}`);

	return result;
}
