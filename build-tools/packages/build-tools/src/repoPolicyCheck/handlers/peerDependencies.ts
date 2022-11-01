/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EOL as newline } from "os";
import sortPackageJson from "sort-package-json";

import { IPackage } from "../../common/npmPackage";
import { Handler, readFile, writeFile } from "../common";

export const handler: Handler = {
    name: "azure-client-peerDependencies",
    match: /.*?azure-client\/package\.json/i,
    handler: (file) => {
        let jsonStr: string;
        let pkgJson: IPackage;
        try {
            jsonStr = readFile(file);
            pkgJson = JSON.parse(jsonStr);
        } catch (err) {
            return "Error parsing JSON file: " + file;
        }

        if (pkgJson.peerDependencies === undefined) {
            return `azure-client must have a peerDependencies field in package.json`;
        }

        if (
            pkgJson.peerDependencies["fluid-framework"] !==
            pkgJson.peerDependencies["@fluidframework/core-interfaces"]
        ) {
            return `azure-client peerDependencies are invalid: ${pkgJson.peerDependencies["fluid-framework"]}`;
        }

        return undefined;
    },
    resolver: (file) => {
        let jsonStr: string;
        let pkgJson: IPackage;
        try {
            jsonStr = readFile(file);
            pkgJson = JSON.parse(jsonStr);
        } catch (err) {
            return { resolved: false, message: "Error parsing JSON file: " + file };
        }

        if (pkgJson.peerDependencies === undefined) {
            pkgJson.peerDependencies = {
                "fluid-framework": pkgJson.dependencies["@fluidframework/core-interfaces"],
            };
        }

        if (
            pkgJson.peerDependencies["fluid-framework"] !==
            pkgJson.dependencies["@fluidframework/core-interfaces"]
        ) {
            pkgJson.peerDependencies["fluid-framework"] =
                pkgJson.dependencies["@fluidframework/core-interfaces"];
        }

        const output = JSON.stringify(sortPackageJson(pkgJson), undefined, 2).concat(newline);
        try {
            writeFile(file, output);
        } catch (error: any) {
            return { resolved: false, message: error.toString() };
        }

        return { resolved: true };
    },
};
