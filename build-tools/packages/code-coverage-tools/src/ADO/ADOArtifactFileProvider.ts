/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebApi } from "azure-devops-node-api";
import JSZip from "jszip";
import { codeCoverageConstants } from "./codeCoverageConstants";
import { unzipStream } from "./utils";

/**
 * Downloads an Azure Devops artifacts and parses it with the jszip library.
 * @param adoConnection - A connection to the ADO api.
 * @param buildNumber - The ADO build number that contains the artifact we wish to fetch
 * @param artifactName - Name of the artifact to download
 */
export async function getZipObjectFromArtifact(
	adoConnection: WebApi,
	buildNumber: number,
	artifactName: string,
): Promise<JSZip> {
	const buildApi = await adoConnection.getBuildApi();

	const artifactStream = await buildApi.getArtifactContentZip(
		codeCoverageConstants.projectName,
		buildNumber,
		artifactName,
	);

	// We want our relative paths to be clean, so navigating JsZip into the top level folder
	const result = (await unzipStream(artifactStream)).folder(artifactName);

	if (!result) {
		throw new Error(`getZipObjectFromArtifact could not find the folder ${artifactName}`);
	}

	return result;
}
