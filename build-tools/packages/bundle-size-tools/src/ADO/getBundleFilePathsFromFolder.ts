/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface BundleFileData {
    bundleName: string;

    relativePathToStatsFile: string;

    relativePathToConfigFile: string | undefined;
}

function getBundleNameFromPath(relativePath: string): string {
    // Our artifacts are stored in the the format /<npm scope>/<package name>[/<bundle name>]/<file name>.
    // We want to use the npm scope + package name as the bundle name.
    // The regex here normalized the slashes in the path names.
    const pathParts = relativePath.replace(/\\/g, "/").split("/");

    if (pathParts.length < 3) {
        throw Error(`Could not derive a bundle name from this path: ${relativePath}`);
    }
    pathParts.pop(); // Remove the filename

    return pathParts.join("/");
}

export function getBundleFilePathsFromFolder(relativePathsInFolder: string[]): BundleFileData[] {
    const statsFilePaths: Omit<BundleFileData, "relativePathToConfigFile">[] = [];

    // A map from bundle name to a bundle buddy config
    const configFilePathMap = new Map<string, string>();

    relativePathsInFolder.forEach((relativePath) => {
        if (relativePath.endsWith(".msp.gz")) {
            statsFilePaths.push({
                bundleName: getBundleNameFromPath(relativePath),
                relativePathToStatsFile: relativePath,
            });
        } else if (relativePath.endsWith("bundleBuddyConfig.json")) {
            configFilePathMap.set(getBundleNameFromPath(relativePath), relativePath);
        }
    });

    return statsFilePaths.map(({ bundleName, relativePathToStatsFile }) => ({
        bundleName,
        relativePathToStatsFile,
        relativePathToConfigFile: configFilePathMap.get(bundleName),
    }));
}
