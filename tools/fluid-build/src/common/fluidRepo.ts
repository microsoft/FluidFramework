import * as path from "path";
import { Packages, Package } from "./npmPackage";
import { rimrafWithErrorAsync, ExecAsyncResult, execWithErrorAsync } from "./utils";
import { FluidPackageCheck, RepoType } from "../fluidBuild/fluidPackageCheck";

export interface IPackageMatchedOptions {
    match: string[];
    all: boolean;
    server: boolean;
};

export class FluidRepo {
    // TODO: Should read lerna.json to determine
    private readonly clientDirectory = path.join(this.resolvedRoot, "packages");
    private readonly serverDirectory = path.join(this.resolvedRoot, "server/routerlicious/packages");
    private readonly exampleDirectory = path.join(this.resolvedRoot, "examples/components");
    private readonly baseDirectories = [
        path.join(this.resolvedRoot, "common"),
        this.serverDirectory,
        this.clientDirectory,
        this.exampleDirectory,
    ];
    private readonly packageInstallDirectories = [
        path.join(this.resolvedRoot, "common/build/build-common"),
        path.join(this.resolvedRoot, "common/build/eslint-config-fluid"),
        path.join(this.resolvedRoot, "common/lib/common-definitions"),
        path.join(this.resolvedRoot, "common/lib/common-utils"),
    ];
    private readonly monoReposInstallDirectories = [
        path.join(this.resolvedRoot),
        this.serverDirectory,
    ];

    public readonly packages: Packages;
    constructor(private readonly resolvedRoot: string) {
        this.packages = Packages.load(this.baseDirectories);

        this.packages.packages.forEach((pkg) => {
            pkg.packageCheck = new FluidPackageCheck(
                pkg.directory.startsWith(this.serverDirectory)? RepoType.Server :
                pkg.directory.startsWith(this.clientDirectory)? RepoType.Client : RepoType.Common
            ); 
        });
    }

    public async install(nohoist: boolean) {
        if (nohoist) {
            return this.packages.noHoistInstall(this.resolvedRoot);
        }
        const installScript = "npm i";
        const installPromises: Promise<ExecAsyncResult>[] = [];
        for (const dir of [...this.packageInstallDirectories, ...this.monoReposInstallDirectories]) {
            installPromises.push(execWithErrorAsync(installScript, { cwd: dir }, dir));
        }
        const rets = await Promise.all(installPromises);

        return !rets.some(ret => ret.error);
    }

    public async uninstall() {
        const cleanPackageNodeModules = this.packages.cleanNodeModules();
        const removePromise = Promise.all(
            this.monoReposInstallDirectories.map(dir => rimrafWithErrorAsync(path.join(dir, "node_modules"), dir))
        );

        const r = await Promise.all([cleanPackageNodeModules, removePromise]);
        return r[0] && !r[1].some(ret => ret.error);
    };

    public setMatched(options: IPackageMatchedOptions) {
        const hasMatchArgs = options.match.length;
        
        if (hasMatchArgs) {
            let matched = false;
            options.match.forEach((arg) => {
                const regExp = new RegExp(arg);
                if (this.matchWithFilter(pkg => regExp.test(pkg.name))) {
                    matched = true;
                }
            });
            return matched;
        }

        if (options.all) {
            return this.matchWithFilter(pkg => true);
        }

        if (options.server) {
            return this.matchWithFilter(pkg => pkg.directory.startsWith(this.serverDirectory));
        }

        // Default to client and example packages
        return this.matchWithFilter(
            pkg => pkg.directory.startsWith(this.clientDirectory) || pkg.directory.startsWith(this.exampleDirectory)
        );
    }

    private matchWithFilter(callback: (pkg: Package) => boolean) {
        let matched = false;
        this.packages.packages.forEach((pkg) => {
            if (callback(pkg)) {
                pkg.setMatched();
                matched = true;
            }
        });
        return matched;
    }
};