/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import axios from "axios";
import { Router } from "express";
import * as mime from "mime";
import * as nconf from "nconf";
import * as npa from "npm-package-arg";
import * as semver from "semver";
import { fetchFile } from "./loader";

interface IPackageDetails {
    name: string;
    version: string;
    path: string;
    raw: npa.Result;
    type: "git" | "tag" | "version" | "range" | "file" | "directory" | "remote";
}

function getPackageDetails(fullPath: string): IPackageDetails {
    const split = fullPath.split("/");
    if (split.length === 0) {
        return null;
    }

    // include scope in package if specified
    let packageSpecifier = split[0];
    let path: string;
    if (packageSpecifier[0] === "@") {
        if (split.length <= 1) {
            return null;
        }

        packageSpecifier = `${packageSpecifier}/${split[1]}`;
        path = split.slice(2).join("/");
    } else {
        path = split.slice(1).join("/");
    }

    let result: npa.Result;
    try {
        result = npa(packageSpecifier);
    } catch {
        return null;
    }

    if (!result.registry) {
        return null;
    }

    return {
        name: result.name,
        path,
        raw: result,
        type: result.type,
        version: result.fetchSpec,
    };
}

/**
 * Creates and configures a router for responding to npm package requests.
 * @param store - config store for router
 */
export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function getContent(fullPath: string): Promise<{ contents: Buffer, path: string, type: string }> {
        const packageDetails = getPackageDetails(fullPath);
        if (!packageDetails) {
            return Promise.reject("Invalid package name");
        }

        const npmUrl = store.get("npm:url");
        const auth = {
            password: store.get("npm:password"),
            username: store.get("npm:username"),
        };

        const url = `${npmUrl}/${encodeURI(packageDetails.name)}`;
        const details = await axios.get(url, { auth });
        const pkgInfo = details.data;

        // extract the package details
        let fetchVersion: string;
        if (packageDetails.type === "range") {
            fetchVersion = semver.maxSatisfying(Object.keys(pkgInfo.versions), packageDetails.version);
        } else if (packageDetails.type === "tag") {
            fetchVersion = pkgInfo["dist-tags"][packageDetails.version];
        } else {
            fetchVersion = packageDetails.version;
        }

        const fetchVersionDetails = pkgInfo.versions[fetchVersion];
        if (!fetchVersionDetails) {
            return Promise.reject("Invalid package version");
        }

        const contents = await fetchFile(
            packageDetails.name,
            fetchVersion,
            packageDetails.path,
            npmUrl,
            auth.username,
            auth.password);

        return { contents, path: packageDetails.path, type: packageDetails.type };
    }

    router.get("/*", (request, response) => {
        const contentP = getContent(request.params[0]);
        contentP.then(
            (result) => {
                if (result.type === "version") {
                    response.setHeader("Cache-Control", "public, max-age=31536000");
                }

                const mimeType = mime.getType(result.path);
                if (mimeType) {
                    response.setHeader("Content-Type", mimeType);
                }

                response.status(200).end(result.contents);
            },
            (error) => {
                response.status(400).json(error.toString());
            });
    });

    return router;
}
