/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as semver from "semver";

export type PackageDetails ={
    readonly name: string;
    readonly packageDir: string;
    readonly version: string;
    readonly oldVersions: readonly string[];
    readonly broken: BrokenCompatTypes;
}

export interface BrokenCompatSettings{
    backCompat?: false;
    forwardCompat?: false;
}

export type BrokenCompatTypes = Partial<Record<string,Record<string, BrokenCompatSettings>>>;


interface PackageJson{
    name:string,
    version: string,
    devDependencies: Record<string, string>;
    typeValidation?: {
        version: string,
        broken: BrokenCompatTypes,
    },
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

    // normalize the version to remove any pre-release version info,
    // as we shouldn't change the type validation version for pre-release versions
    const normalizedVersion =
        pkgJson.version.includes("-") ?
            pkgJson.version.substring(0, pkgJson.version.indexOf("-")) :
            pkgJson.version;

    if(normalizedVersion !== pkgJson.typeValidation?.version){
        if(pkgJson.typeValidation !== undefined){
            pkgJson.devDependencies[`${pkgJson.name}-${pkgJson.typeValidation.version}`] =
                `npm:${pkgJson.name}@${pkgJson.typeValidation.version}`;

            pkgJson.devDependencies = createSortedObject(pkgJson.devDependencies);
        }
        pkgJson.typeValidation = {
            version: normalizedVersion,
            broken: pkgJson.typeValidation?.broken ?? {}
        }
        fs.writeFileSync(packagePath, JSON.stringify(pkgJson, undefined, 2));
    }

    const oldVersions: string[] =
        Object.keys(pkgJson.devDependencies ?? {}).filter((k)=>k.startsWith(pkgJson.name));

    return {
        name: pkgJson.name,
        packageDir,
        version: normalizedVersion,
        oldVersions,
        broken: pkgJson.typeValidation.broken
    }
}

export function findPackagesUnderPath(path: string) {
    const searchPaths = [path];
    const packages: string[] = [];
    while(searchPaths.length > 0){
        const search = searchPaths.shift()!;
        if(fs.existsSync(`${search}/package.json`)){
            packages.push(search);
        }else{
            searchPaths.push(
                ...fs.readdirSync(search, {withFileTypes: true})
                .filter((t)=>t.isDirectory())
                .map((d)=>`${search}/${d.name}`));
        }
    }
    return packages;
}
