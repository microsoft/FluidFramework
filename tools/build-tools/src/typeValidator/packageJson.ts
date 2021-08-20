/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

export type PackageVersion ={
    readonly name: string;
    readonly major: number;
    readonly minor: number;
    readonly patch: string;
    readonly noPatchString: string;
}

export function getPackageDetails(packageDir: string): PackageVersion {

    const packagePath = `${packageDir}/package.json`;
    if(!fs.existsSync(packagePath)){
        throw new Error(`Package json does not exist: ${packagePath}`)
    }

    const pkgJson = JSON.parse(fs.readFileSync(packagePath).toString());
    const rawVersion: string = pkgJson.version;
    const versionParts = rawVersion.split(".",3);
    const major = Number.parseInt(versionParts[0]);
    const minor = Number.parseInt(versionParts[1]);

    return {
        name: pkgJson.name,
        major,
        minor,
        patch: versionParts[2],
        noPatchString: `${major}.${minor}.0`,
    }
}
