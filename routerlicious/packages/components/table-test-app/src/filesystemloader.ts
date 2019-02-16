import { IChaincodeFactory, ICodeLoader } from "@prague/container-definitions";
import * as path from "path";

export class FileSystemLoader implements ICodeLoader {
    private readonly nameToFolder: Map<string, string>;

    constructor(root: string) {
        // tslint:disable-next-line:non-literal-require
        const projects = require(path.join(root, "rush.json")).projects;
        this.nameToFolder = new Map(projects.map(
            (entry) => [ entry.packageName, path.join(root, entry.projectFolder) ]
        ));
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        // TODO: Add caching so you don't download the same chaincode multiple times in a given session.
        const [, name] = components;
        const path = this.nameToFolder.get(name);
        const module = await import(path);
        return module;
    }
}