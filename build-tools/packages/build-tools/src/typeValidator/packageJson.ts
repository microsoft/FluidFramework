/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as util  from "util";
import child_process from "child_process";
import { upperFirst } from "lodash";

export type PackageDetails ={
    readonly packageDir: string;
    readonly oldVersions: readonly string[];
    readonly broken: BrokenCompatTypes;
    readonly pkg: PackageJson,
}

export interface BrokenCompatSettings{
    backCompat?: false;
    forwardCompat?: false;
}

export type BrokenCompatTypes = Partial<Record<string, BrokenCompatSettings>>;


interface PackageJson{
    name:string,
    version: string,
    main: string | undefined,
    devDependencies: Record<string, string>;
    typeValidation?: {
        version: string,
        broken: BrokenCompatTypes,
        disabled?: boolean,
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

function safeParse(json: string, error: string){
    try{
        return JSON.parse(json);
    }catch{
        throw new Error(error);
    }
}

export async function getPackageDetails(packageDir: string):  Promise<PackageDetails> {
    const packagePath = `${packageDir}/package.json`;
    if(!await util.promisify(fs.exists)(packagePath)){
        throw new Error(`Package json does not exist: ${packagePath}`)
    }
    const content = await util.promisify(fs.readFile)(packagePath);

    const pkgJson: PackageJson = safeParse(content.toString(), packagePath);

    const oldVersions: string[] =
        Object.keys(pkgJson.devDependencies ?? {}).filter((k)=>k.startsWith(pkgJson.name));

    return {
        pkg: pkgJson,
        packageDir,
        oldVersions,
        broken: pkgJson.typeValidation?.broken ?? {}
    };
}

export async function getAndUpdatePackageDetails(packageDir: string, updateOptions: {cwd?: string} | undefined): Promise<PackageDetails & {skipReason?: undefined} | {skipReason: string}> {

    const packageDetails= await getPackageDetails(packageDir);

    if(packageDetails.pkg.name.startsWith("@fluid-internal")){
        return {skipReason: "Skipping package: @fluid-internal "}
    }else if( packageDetails.pkg.main?.endsWith("index.js") !== true){
        return  {skipReason: "Skipping package: no index.js in main property"}
    }else if(packageDetails.pkg.typeValidation?.disabled === true){
        return  {skipReason: "Skipping package: type validation disabled"}
    }

        // normalize the version to remove any pre-release version info,
    // as we shouldn't change the type validation version for pre-release versions
    const normalizedVersion =
        packageDetails.pkg.version.includes("-") ?
            packageDetails.pkg.version.substring(0, packageDetails.pkg.version.indexOf("-")) :
            packageDetails.pkg.version;

    if(updateOptions === undefined  || normalizedVersion === packageDetails.pkg.typeValidation?.version){
        return packageDetails;
    }


    /*
    * this is where we build the previous version we use to compare against the current version.
    * For major we use semver such that the current major is compared against the latest
    * previous major. In the case of minor we target specific previous minor version.
    * Similarly for patch we do not use semver, we compare directly to the previous patch version.
    *
    * We do this to align with our release process. We are strictest between patches and minor, and looser between major
    * We may need to adjust this as we adjust our release processes.
    */
    let normalizeParts = normalizedVersion.split(".").map((p)=>Number.parseInt(p));
    const validationVersionParts = packageDetails.pkg.typeValidation?.version?.split(".").map((p)=>Number.parseInt(p)) ?? [0,0,0];
    let semVer = "";
    if(normalizeParts[0] !== validationVersionParts[0]){
        semVer = "^"
        normalizeParts= [normalizeParts[0] -1, 0, 0];
    }else if(normalizeParts[1] !== validationVersionParts[1]){
        normalizeParts= [normalizeParts[0], normalizeParts[1] -1, 0];
    }else{
        normalizeParts[2] = validationVersionParts[2];
    }
    const previousVersion = normalizeParts.join(".");

    // check that the version exists on npm before trying to add the
    // dev dep and bumping the typeValidation version
    // if the version does not exist, we will defer updating the package
    const packageDef = `${packageDetails.pkg.name}@${semVer}${previousVersion}`
    const args = ["view", `"${packageDef}"`, "version", "--json"];
    const result = child_process.execSync(`npm ${args.join(" ")}`,{cwd: updateOptions.cwd ?? packageDir}).toString()
    const maybeVersions =
        result !== undefined
        && result.length >0
            ? safeParse(result, args.join(" "))
            : undefined;

    const versionsArray =
        typeof maybeVersions === "string"
            ? [maybeVersions]
            : Array.isArray(maybeVersions)
                ? maybeVersions
                : [];


    if(versionsArray.length > 0){
        packageDetails.pkg.devDependencies[`${packageDetails.pkg.name}-previous`] = `npm:${packageDef}`;

        packageDetails.pkg.devDependencies = createSortedObject(packageDetails.pkg.devDependencies);

        packageDetails.pkg.typeValidation = {
            version: normalizedVersion,
            broken: {}
        }
        await util.promisify(fs.writeFile)(`${packageDir}/package.json`, JSON.stringify(packageDetails.pkg, undefined, 2));
    }
    const oldVersions =
        Object.keys(packageDetails.pkg.devDependencies ?? {}).filter((k)=>k.startsWith(packageDetails.pkg.name));
    return {
        ... packageDetails,
        oldVersions,
    }
}

export async function findPackagesUnderPath(path: string) {
    const searchPaths = [path];
    const packages: string[] = [];
    while(searchPaths.length > 0){
        const search = searchPaths.shift()!;
        if(await util.promisify(fs.exists)(`${search}/package.json`)){
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
