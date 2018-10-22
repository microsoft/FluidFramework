import axios from "axios";
import { Stream } from "stream";
import * as tar from "tar-stream";
import * as zlib from "zlib";

export async function fetchFile(
    name: string,
    version: string,
    path: string,
    baseUrl: string,
    username: string,
    password: string): Promise<Buffer> {

    const auth = { username, password };
    const url = `${baseUrl}/${encodeURI(name)}/${encodeURI(version)}`;
    const details = await axios.get(url, { auth });

    const data = await axios.get<Stream>(details.data.dist.tarball, { auth, responseType: "stream" });

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
