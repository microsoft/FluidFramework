import { IChaincodeFactory, ICodeLoader, IPlatform, IPlatformFactory } from "@prague/container-definitions";
import { exec } from "child_process";
import { EventEmitter } from "events";
import { promisify } from "util";

const asyncExec = promisify(exec);

const npmRegistry = "https://packages.wu2.prague.office-int.com";

export class NodeCodeLoader implements ICodeLoader {
    public async load(pkg: string): Promise<IChaincodeFactory> {
        const components = pkg.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }
        const [, scope, name] = components;

        const packagesBase = `/tmp/chaincode`;
        await asyncExec(`npm install ${pkg} --registry ${npmRegistry}`, { cwd: packagesBase });

        // tslint:disable:no-unsafe-any
        // tslint:disable-next-line:non-literal-require
        const entry = import(`${packagesBase}/node_modules/${scope}/${name}`);
        return entry;
    }
}

class NodePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }

    public detach() {
        return;
    }
}

export class NodePlatformFactory implements IPlatformFactory {
    public async create(): Promise<IPlatform> {
        return new NodePlatform();
    }
}
