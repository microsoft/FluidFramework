/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { BundleBuddyConfig } from "../BundleBuddyTypes";
import { BundleFileData } from "./getBundleFilePathsFromFolder";

export interface GetBundleBuddyConfigMapArgs {
    bundleFileData: BundleFileData[];

    getBundleBuddyConfig: (relativePath: string) => Promise<BundleBuddyConfig>;
}

export async function getBundleBuddyConfigMap(
    args: GetBundleBuddyConfigMapArgs,
): Promise<Map<string, BundleBuddyConfig>> {
    const result = new Map<string, BundleBuddyConfig>();

    const asyncWork: Promise<void>[] = [];
    args.bundleFileData.forEach((bundle) => {
        if (bundle.relativePathToConfigFile) {
            asyncWork.push(
                args.getBundleBuddyConfig(bundle.relativePathToConfigFile).then((configFile) => {
                    result.set(bundle.bundleName, configFile);
                }),
            );
        }
    });

    await Promise.all(asyncWork);

    return result;
}
