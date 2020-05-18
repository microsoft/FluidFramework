/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import axios from "axios";
import { Stream } from "stream";
import * as tar from "tar-stream";
import * as zlib from "zlib";

export interface IPackageDetails {
    dist: {
        tarball: string,
    };
}

/**
 * Fetches an npm package from an npm registry.  This will get a tarball
 * from the registry and stream the unzipped data returning a buffer of
 * the raw package data.
 * @param name - name of package to fetch
 * @param version - version of package to fetch
 * @param path - path of package to fetch
 * @param baseUrl - base URL for npm package registry
 * @param username - username for npm package registry
 * @param password - password for npm package registry
 */
export async function fetchFile(
    details: IPackageDetails,
    path: string,
    username: string,
    password: string,
): Promise<Buffer> {
    const auth = { username, password };

    const data = await axios.get<Stream>(details.dist.tarball, { auth, responseType: "stream" });

    const extract = tar.extract();
    const gunzip = zlib.createGunzip();

    data.data.pipe(gunzip).pipe(extract);

    const entryName = `package/${path}`;
    const chunks = new Array<Buffer>();

    return new Promise<Buffer>((resolve, reject) => {
        extract.on("entry", (header, stream, next) => {
            stream.on("data", (entryData) => {
                if (header.name === entryName) {
                    chunks.push(entryData);
                }
            });

            stream.on("end", () => {
                next();
            });

            stream.resume();
        });

        extract.on("error", (error) => {
            reject(error);
        });

        extract.on("finish", () => {
            if (chunks.length === 0) {
                reject("Not found");
            } else {
                const fullChunk = Buffer.concat(chunks);
                resolve(fullChunk);
            }
        });
    });
}
