/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as util  from "util";
import child_process from "child_process";

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

// back compat for the previous back compat setting the nested under the version number
export type BackCompatBrokenCompatSettings = BrokenCompatSettings & Partial<Record<string, BrokenCompatSettings>>

export type BrokenCompatTypes = Partial<Record<string, BackCompatBrokenCompatSettings>>;


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

export async function getPackageDetailsOrThrow(packageDir: string, updateOptions?: {cwd?: string}):  Promise<PackageDetails> {
    const result = await getPackageDetails(packageDir, updateOptions);
    if(result.skipReason !== undefined){
        throw new Error(result.skipReason);
    }
    return result;
}

export async function getPackageDetails(packageDir: string, updateOptions?: {cwd?: string}): Promise<PackageDetails & {skipReason?: undefined} | {skipReason: string}> {

    const packagePath = `${packageDir}/package.json`;
    if(!await util.promisify(fs.exists)(packagePath)){
        throw new Error(`Package json does not exist: ${packagePath}`)
    }
    const content = await util.promisify(fs.readFile)(packagePath);

    const pkgJson: PackageJson = safeParse(content.toString(), packagePath);

    if(pkgJson.name.startsWith("@fluid-internal")){
        return {skipReason: "Skipping package: @fluid-internal "}
    }else if( pkgJson.main?.endsWith("index.js") !== true){
        return  {skipReason: "Skipping package: no index.js in main property"}
    }else if(pkgJson.typeValidation?.disabled === true){
        return  {skipReason: "Skipping package: type validation disabled"}
    }

    // normalize the version to remove any pre-release version info,
    // as we shouldn't change the type validation version for pre-release versions
    const normalizedVersion =
        pkgJson.version.includes("-") ?
            pkgJson.version.substring(0, pkgJson.version.indexOf("-")) :
            pkgJson.version;

    // if the packages has no type validation data, then initialize it
   if(updateOptions !== undefined && normalizedVersion !== pkgJson.typeValidation?.version){
        /*
         * this is where we build the previous version we use to compare against the current version.
         * For both major and minor we use semver such that the current major is compared against the latest
         * previous major, and the same for minor.
         * For patch we do not use semver, we compare directly to the previous patch version.
         *
         * We do this to align with our release process. We are strictest between patches, and looser between minor and major
         * We may need to adjust this as we adjust our release processes.
         */
        let normalizeParts = normalizedVersion.split(".").map((p)=>Number.parseInt(p));
        const validationVersionParts = pkgJson.typeValidation?.version?.split(".").map((p)=>Number.parseInt(p)) ?? [0,0,0];
        let semVer="^"
        if(normalizeParts[0] !== validationVersionParts[0]){
            normalizeParts= [normalizeParts[0] -1, 0, 0];
        }else if(normalizeParts[1] !== validationVersionParts[1]){
            normalizeParts= [normalizeParts[0], normalizeParts[1] -1, 0];
        }else{
            semVer="";
            normalizeParts[2] = validationVersionParts[2];
        }
        const previousVersion = normalizeParts.join(".");

        // check that the version exists on npm before trying to add the
        // dev dep and bumping the typeValidation version
        // if the version does not exist, we will defer updating the package
        const packageDef = `${pkgJson.name}@${semVer}${previousVersion}`
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
            pkgJson.devDependencies[`${pkgJson.name}-previous`] = `npm:${packageDef}`;

            pkgJson.devDependencies = createSortedObject(pkgJson.devDependencies);

            pkgJson.typeValidation = {
                version: normalizedVersion,
                broken: {}
            }
            await util.promisify(fs.writeFile)(packagePath, JSON.stringify(pkgJson, undefined, 2));
        }
    }

    const oldVersions: string[] =
        Object.keys(pkgJson.devDependencies ?? {}).filter((k)=>k.startsWith(pkgJson.name));

    return {
        name: pkgJson.name,
        packageDir,
        version: normalizedVersion,
        oldVersions,
        broken: pkgJson.typeValidation?.broken ?? {}
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
