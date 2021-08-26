/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

export type PackageDetails ={
    readonly name: string;
    readonly version: string;
    readonly majorVersion: number;
    readonly minorVersion: number;
    readonly patchVersion: string;
    readonly oldVersions: readonly string[];
}

interface PackageJson{
    name:string,
    version: string,
    devDependencies: Record<string, string>;
    typeValidationVersion: string,
}

export function getPackageDetails(packageDir: string): PackageDetails {

    const packagePath = `${packageDir}/package.json`;
    if(!fs.existsSync(packagePath)){
        throw new Error(`Package json does not exist: ${packagePath}`)
    }

    const pkgJson: PackageJson = JSON.parse(fs.readFileSync(packagePath).toString());

    if(pkgJson.version !== pkgJson.typeValidationVersion){
        if(pkgJson.typeValidationVersion !== undefined){
            pkgJson.devDependencies[`${pkgJson.name}-${pkgJson.typeValidationVersion}`] =
                `npm:${pkgJson.name}@${pkgJson.typeValidationVersion}`;
        }
        pkgJson.typeValidationVersion = pkgJson.version;
        fs.writeFileSync(packagePath, JSON.stringify(pkgJson, undefined, 2));
    }

    const versionParts = pkgJson.version.split(".",3);
    const majorVersion = Number.parseInt(versionParts[0]);
    const minorVersion = Number.parseInt(versionParts[1]);

    const oldVersions: string[] =[];
    for(const depName of Object.keys(pkgJson.devDependencies)){
        if(depName.startsWith(pkgJson.name)){
            oldVersions.push(depName);
        }
    }


    return {
        name: pkgJson.name,
        version: pkgJson.version,
        majorVersion,
        minorVersion,
        patchVersion: versionParts[2],
        oldVersions
    }
}
