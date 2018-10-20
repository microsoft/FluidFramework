import axios from "axios";
import { Router } from "express";
import * as nconf from "nconf";
import * as npa from "npm-package-arg";
import * as winston from "winston";
import { ICache } from "../services";
import { handleResponse } from "./utils";

interface IPackageDetails {
    pkg: string;
    version: string;
    file: string;
    raw: npa.Result;
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
        pkg: result.name,
        raw: result,
        version: result.fetchSpec,
    };
}

export function create(store: nconf.Provider, cache: ICache): Router {
    const router: Router = Router();

    async function getContent(path: string): Promise<IPackageDetails> {
        const packageDetails = getPackageDetails(path);
        if (!packageDetails) {
            return Promise.reject("Invalid package name");
        }

        const npmUrl = store.get("npm:url");
        const auth = {
            password: store.get("npm:password"),
            username: store.get("npm:username"),
        };

        const url = `${npmUrl}/${encodeURI(packageDetails.pkg)}`;
        const details = await axios.get(url, { auth });
        winston.info(JSON.stringify(Object.keys(details.data.versions)));

        // Got the details. With the details can check for a version using the semver package.
        // Then can download the tarball for that version. Then can crack the tarball and pull out the
        // specified file. Can stash file and version info in redis.

        return details.data;
    }

    // unpkg.com/:package@:version/:file
    router.get("/*", (request, response) => {
        const contentP = getContent(request.params[0]);
        handleResponse(contentP, response, false);
    });

    return router;
}
