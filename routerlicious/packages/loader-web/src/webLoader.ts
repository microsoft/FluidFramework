import {
    IChaincodeFactory,
    ICodeLoader,
    IPraguePackage,
} from "@prague/runtime-definitions";
import * as assert from "assert";
import axios from "axios";
import * as pako from "pako";

// js-untar can't be imported in a node environment
// tslint:disable-next-line:no-var-requires
const untar = typeof window !== "undefined" ? require("js-untar") : undefined;

interface ITarEntry {
    buffer: ArrayBuffer;
    blob: Blob;
    name: string;
    mode: string;
    uid: string;
    gid: string;
    size: number;
    mtime: number;
    checksum: number;
    type: string;
    linkname: string;
    ustarFormat: string;
    version: string;
    uname: string;
    gname: string;
    devmajor: number;
    devminor: number;
    namePrefix: string;
    getBlobUrl(): string;
    readAsJSON(): any;
    readAsString(): string;
}

export class WebLoader implements ICodeLoader {
    constructor(private baseUrl: string) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        const auth = { username: "prague", password: "bohemia" };
        const [, scope, name, version] = components;
        // tslint:disable-next-line:max-line-length
        const url = `${this.baseUrl}/${encodeURI(scope)}/${encodeURI(name)}/${encodeURI(version)}`;
        const details = await axios.get(url, { auth });

        const data = await axios.get<ArrayBuffer>(details.data.dist.tarball, { auth, responseType: "arraybuffer"});
        const inflateResult = pako.inflate(new Uint8Array(data.data));
        const extractedFiles = await untar(inflateResult.buffer) as ITarEntry[];

        const pkg = new Map<string, ITarEntry>();
        for (const extractedFile of extractedFiles) {
            pkg.set(extractedFile.name, extractedFile);
        }

        if (!pkg.has("package/package.json")) {
            return Promise.reject("Not a valid npm module");
        }

        const textDecoder = new TextDecoder("utf-8");
        const packageJson = JSON.parse(textDecoder.decode(pkg.get("package/package.json").buffer)) as IPraguePackage;
        assert(packageJson.prague && packageJson.prague.browser);

        for (const bundle of packageJson.prague.browser.bundle) {
            const appended = `package/${bundle}`;
            if (!pkg.has(appended)) {
                return Promise.reject("browser entry point missing");
            }

            const file = textDecoder.decode(pkg.get(appended).buffer);

            // TODO using eval for now but likely will want to switch to a script import with a wrapped context
            // to isolate the code
            // tslint:disable-next-line:no-eval
            eval.call(null, file);
        }

        return window[packageJson.prague.browser.entrypoint];
    }
}
