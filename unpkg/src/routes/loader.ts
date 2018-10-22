import { Deferred } from "@prague/utils";
import axios from "axios";
import { Duplex } from "stream";
import * as tar from "tar-stream";
import * as winston from "winston";
import * as zlib from "zlib";

export async function fetchFile(
    scope: string,
    name: string,
    version: string,
    path: string,
    baseUrl: string,
    username: string,
    password: string): Promise<string> {

    const auth = { username, password };

    if (scope) {
        name = name.slice(name.indexOf(scope) + scope.length + 1);
    }

    // tslint:disable-next-line:max-line-length
    winston.info(baseUrl, scope, name, version);
    const url = `${baseUrl}/${encodeURI(scope)}/${encodeURI(name)}/${encodeURI(version)}`;
    winston.info(url);
    const details = await axios.get(url, { auth });

    const data = await axios.get<ArrayBuffer>(details.data.dist.tarball, { auth, responseType: "arraybuffer"});

    const inputStream = new Duplex();
    const extract = tar.extract();
    const gunzip = zlib.createGunzip();

    const result = new Deferred<string>();

    inputStream.pipe(gunzip).pipe(extract);

    const entryName = `package/${path}`;
    const chunks = new Array<Buffer>();

    extract.on("entry", (header, stream, next) => {
        winston.info(JSON.stringify(header, null, 2));
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
        result.reject(error);
    });

    extract.on("finish", () => {
        if (chunks.length === 0) {
            result.reject("Not found");
        }

        const fullChunk = Buffer.concat(chunks);
        result.resolve(fullChunk.toString("utf-8"));
    });

    inputStream.push(data.data);
    inputStream.push(null);

    return result.promise;
}
