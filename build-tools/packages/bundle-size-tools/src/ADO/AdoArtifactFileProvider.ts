/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import { WebApi } from "azure-devops-node-api";
import JSZip from "jszip";
import { StatsCompilation } from "webpack";

import { BundleBuddyConfig } from "../BundleBuddyTypes";
import { decompressStatsFile, unzipStream } from "../utilities";
import { BundleFileData, getBundleFilePathsFromFolder } from "./getBundleFilePathsFromFolder";

/**
 * Gets a list of all paths relevant to bundle buddy from the zip archive
 * @param jsZip - A zip file that has been processed with the jszip library
 */
export function getBundlePathsFromZipObject(jsZip: JSZip): BundleFileData[] {
    const relativePaths: string[] = [];
    jsZip.forEach((path) => {
        relativePaths.push(path);
    });

    return getBundleFilePathsFromFolder(relativePaths);
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
    bundleAnalysisArtifactName: string,
): Promise<JSZip> {
    const buildApi = await adoConnection.getBuildApi();

    const artifactStream = await buildApi.getArtifactContentZip(
        projectName,
        buildNumber,
        bundleAnalysisArtifactName,
    );

    // We want our relative paths to be clean, so navigating JsZip into the top level folder
    const result = (await unzipStream(artifactStream)).folder(bundleAnalysisArtifactName);
    assert(
        result,
        `getZipObjectFromArtifact could not find the folder ${bundleAnalysisArtifactName}`,
    );

    return result;
}

/**
 * Retrieves a decompressed stats file from a jszip object
 * @param jsZip - A zip file that has been processed with the jszip library
 * @param relativePath - The relative path to the file that will be retrieved
 */
export async function getStatsFileFromZip(
    jsZip: JSZip,
    relativePath: string,
): Promise<StatsCompilation> {
    const jsZipObject = jsZip.file(relativePath);
    assert(jsZipObject, `getStatsFileFromZip could not find file ${relativePath}`);

    const buffer = await jsZipObject.async("nodebuffer");
    return decompressStatsFile(buffer);
}

/**
 * Retrieves and parses a bundle buddy config file from a jszip object
 * @param jsZip - A zip file that has been processed with the jszip library
 * @param relativePath - The relative path to the file that will be retrieved
 */
export async function getBundleBuddyConfigFileFromZip(
    jsZip: JSZip,
    relativePath: string,
): Promise<BundleBuddyConfig> {
    const jsZipObject = jsZip.file(relativePath);
    assert(jsZipObject, `getBundleBuddyConfigFileFromZip could not find file ${relativePath}`);

    const buffer = await jsZipObject.async("nodebuffer");
    return JSON.parse(buffer.toString());
}
