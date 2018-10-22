import axios from "axios";
import { Router } from "express";
import * as nconf from "nconf";
import * as npa from "npm-package-arg";
import * as semver from "semver";
import { fetchFile } from "./loader";

interface IPackageDetails {
    name: string;
    version: string;
    file: string;
    raw: npa.Result;
    type: "git" | "tag" | "version" | "range" | "file" | "directory" | "remote";
}

function getPackageDetails(path: string): IPackageDetails {
    const split = path.split("/");
    if (split.length === 0) {
        return null;
    }

    // include scope in package if specified
    let packageSpecifier = split[0];
    let file: string;
    if (packageSpecifier[0] === "@") {
        if (split.length <= 1) {
            return null;
        }

        packageSpecifier = `${packageSpecifier}/${split[1]}`;
        file = split.slice(2).join("/");
    } else {
        file = split.slice(1).join("/");
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
        file,
        name: result.name,
        raw: result,
        type: result.type,
        version: result.fetchSpec,
    };
}

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function getContent(path: string): Promise<{ file: Buffer, type: string }> {
        const packageDetails = getPackageDetails(path);
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

        const file = await fetchFile(
            packageDetails.name,
            fetchVersion,
            packageDetails.file,
            npmUrl,
            auth.username,
            auth.password).catch((error) => error.toString());

        return { file, type: packageDetails.type };
    }

    router.get("/*", (request, response) => {
        const contentP = getContent(request.params[0]);
        contentP.then(
            (result) => {
                if (result.type === "version") {
                    response.setHeader("Cache-Control", "public, max-age=31536000");
                }

                response.status(200).end(result.file);
            },
            (error) => {
                response.status(400).json(error.toString());
            });
    });

    return router;
}
