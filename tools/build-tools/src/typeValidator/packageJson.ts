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

function createSortedObject<T>(obj:Record<string,T>): Record<string,T>{
    const sortedKeys = Object.keys(obj).sort();
    const sortedDeps: Record<string,T> ={};
    for(const key of sortedKeys){
        sortedDeps[key] = obj[key];
    }
    return sortedDeps;
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

            pkgJson.devDependencies = createSortedObject(pkgJson.devDependencies);
        }
        pkgJson.typeValidationVersion = pkgJson.version;
        fs.writeFileSync(packagePath, JSON.stringify(pkgJson, undefined, 2));
    }

    const versionParts = pkgJson.version.split(".",3);
    const majorVersion = Number.parseInt(versionParts[0]);
    const minorVersion = Number.parseInt(versionParts[1]);

    const oldVersions: string[] =
        Object.keys(pkgJson.devDependencies).filter((k)=>k.startsWith(pkgJson.name));

    return {
        name: pkgJson.name,
        version: pkgJson.version,
        majorVersion,
        minorVersion,
        patchVersion: versionParts[2],
        oldVersions
    }
}
