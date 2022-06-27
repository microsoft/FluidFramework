/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidPackage, IFluidPackageEnvironment } from "@fluidframework/container-definitions";

export interface IPackageIdentifierDetails {
    readonly fullId: string;
    readonly nameAndVersion: string;
    readonly name: string;
    readonly version: string | undefined;
    readonly scope: string;
}

export function extractPackageIdentifierDetails(
    codeDetailsPackage: string | IFluidPackage): IPackageIdentifierDetails {
        const packageString = typeof codeDetailsPackage === "string"
        ? codeDetailsPackage // Just return it if it's a string e.g. "@fluid-example/clicker@0.1.1"
        // If it doesn't exist, let's make it from the package details
        : typeof codeDetailsPackage.version === "string"
            ? `${codeDetailsPackage.name}` // E.g. @fluid-example/clicker
            : `${codeDetailsPackage.name}@${codeDetailsPackage.version}`; // Rebuild e.g. @fluid-example/clicker@0.1.1

    let fullId: string;
    let scope: string;
    let nameAndVersion: string;
    let name: string;
    let version: string | undefined;

    // Two @ symbols === the package has a version. Use alternative RegEx.
    if (packageString.indexOf("@") !== packageString.lastIndexOf("@")) {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec,unicorn/no-unsafe-regex
        const componentsWithVersion = packageString.match(/(@(.*)\/)?((.*)@(.*))/);
        if ((componentsWithVersion === null || componentsWithVersion.length !== 6)) {
            throw new Error("Invalid package");
        }
        [fullId, , scope, nameAndVersion, name, version] = componentsWithVersion;
    } else {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec,unicorn/no-unsafe-regex
        const componentsWithoutVersion = packageString.match(/(@(.*)\/)?((.*))/);
        if ((componentsWithoutVersion === null || componentsWithoutVersion.length !== 5)) {
            throw new Error("Invalid package");
        }
        [fullId, , scope, nameAndVersion, name] = componentsWithoutVersion;
    }

    return {
        fullId,
        name,
        nameAndVersion,
        scope,
        version,
    };
}

export function resolveFluidPackageEnvironment(
    environment: IFluidPackageEnvironment,
    baseUrl: string,
    ): Readonly<IFluidPackageEnvironment> {
    const resolvedEnvironment: IFluidPackageEnvironment = {};
    for (const targetName of Object.keys(environment)) {
        const target = environment[targetName];
        if (target !== undefined) {
            const files: string[] = [];
            for (const file of target.files) {
                if (!file.startsWith("http")) {
                    files.push(`${baseUrl}/${file}`);
                } else {
                    files.push(file);
                }
            }
            resolvedEnvironment[targetName] = {
                files,
                library: target.library,
            };
        }
    }
    return resolvedEnvironment;
}
