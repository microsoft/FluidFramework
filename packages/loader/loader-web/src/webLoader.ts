/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    ICodeWhiteList,
    IFluidCodeDetails,
    IFluidPackage,
    IPackage,
    IPackageConfig,
} from "@microsoft/fluid-container-definitions";
import * as fetch from "isomorphic-fetch";

export interface IParsedPackage {
    full: string;
    pkg: string;
    name: string;
    version: string | undefined;
    scope: string;
}

export interface ISeedable {
    scriptIds: string[];
    package: IFluidPackage;
    config: IPackageConfig;
}

export interface IResolvedPackage {
    details: IFluidCodeDetails;
    parsed: IParsedPackage;
    pkg: IFluidPackage;
    packageUrl: string;
}

interface IPackageDetails {
    details: IFluidCodeDetails;
    parsed: IParsedPackage;
    packageUrl: string;
}

export function extractDetails(value: string): IParsedPackage {
    let full: string;
    let scope: string;
    let pkg: string;
    let name: string;
    let version: string | undefined;

    // Two @ symbols === the package has a version. Use alternative RegEx.
    if (value.indexOf("@") !== value.lastIndexOf("@")) {
        const componentsWithVersion = value.match(/(@(.*)\/)?((.*)@(.*))/);
        if ((!componentsWithVersion || componentsWithVersion.length !== 6)) {
            throw new Error("Invalid package");
        }
        [full, , scope, pkg, name, version] = componentsWithVersion;
    } else {
        const componentsWithoutVersion = value.match(/(@(.*)\/)?((.*))/);
        if ((!componentsWithoutVersion || componentsWithoutVersion.length !== 5)) {
            throw new Error("Invalid package");
        }
        [full, , scope, pkg, name] = componentsWithoutVersion;
    }

    return {
        full,
        name,
        pkg,
        scope,
        version,
    };
}

/**
 * Helper class to manage loading of script elements. Only loads a given script once.
 */
class ScriptManager {
    private readonly loadCache = new Map<string, Promise<void>>();

    // tslint:disable-next-line:promise-function-async
    public loadScript(scriptUrl: string, scriptId?: string): Promise<void> {
        if (!this.loadCache.has(scriptUrl)) {
            const scriptP = new Promise<void>((resolve, reject) => {
                const script = document.createElement("script");
                script.src = scriptUrl;

                if (scriptId !== undefined) {
                    script.id = scriptId;
                }

                // Dynamically added scripts are async by default. By setting async to false, we are enabling the
                // scripts to be downloaded in parallel, but executed in order. This ensures that a script is executed
                // after all of its dependencies have been loaded and executed.
                script.async = false;

                // call signatures don't match and so need to wrap the method
                // tslint:disable-next-line:no-unnecessary-callback-wrapper
                script.onload = () => resolve();
                script.onerror = () =>
                    reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

                document.head.appendChild(script);
            });

            this.loadCache.set(scriptUrl, scriptP);
        }

        // tslint:disable-next-line:no-non-null-assertion
        return this.loadCache.get(scriptUrl)!;
    }

    public loadScripts(
        umdDetails: { files: string[]; library: string; },
        packageUrl: string,
        scriptIds?: string[],
        // tslint:disable-next-line: array-type
    ): Promise<void>[] {
        return umdDetails.files.map(async (bundle, index) => {
            // Load file as cdn Link (starts with http)
            // Or create a cdnLink from packageURl
            const url = bundle.indexOf("http") === 0
                ? bundle
                : `${packageUrl}/${bundle}`;
            return this.loadScript(url, scriptIds !== undefined ? scriptIds[index] : undefined);
        });
    }
}

class FluidPackage {
    private resolveP: Promise<IResolvedPackage> | undefined;
    private loadP: Promise<any> | undefined;

    /**
     * @param details - Fully Normalized IPackageDetails
     */
    constructor(private readonly details: IPackageDetails, private readonly scriptManager: ScriptManager) {
    }

    public seed(scriptIds: string[]) {
        if (this.resolveP || this.loadP) {
            throw new Error("Cannot seed after resolve/load called");
        }

        if (typeof this.details.details.package === "string" || !("fluid" in this.details.details.package)) {
            throw new Error("Full package must have been provided");
        }

        this.resolveP = Promise.resolve({
            details: this.details.details,
            packageUrl: this.details.packageUrl,
            parsed: this.details.parsed,
            pkg: this.details.details.package,
        });

        const entrypoint = this.details.details.package.fluid.browser.umd.library;
        const umdDetails = this.details.details.package.fluid.browser.umd;
        this.loadP = new Promise<any>((resolve, reject) => {
            if (entrypoint in window) {
                resolve(window[entrypoint]);
            }

            const scriptFound = scriptIds.find((scriptId) => {
                const script = document.getElementById(scriptId) as HTMLScriptElement;
                return (script !== null);
            });

            // If the script hasn't been attached, attach it now.
            // This could cause a double load of the script, but scriptManager handles duplicates
            if (scriptFound === undefined) {
                this.scriptManager.loadScripts(umdDetails, this.details.packageUrl, scriptIds);
            }

            // ScriptIds are needed here in case the script hasn't loaded yet
            // if there's no script, fetch and load it
            scriptIds.forEach((scriptId) => {
                const script = document.getElementById(scriptId) as HTMLScriptElement;

                if (script !== undefined && script !== null) {
                    script.onload = () => {
                        if (entrypoint in window) {
                            resolve(window[entrypoint]);
                        }
                    };

                    script.onerror = (error) => {
                        reject(error);
                    };
                }
            });
        });
    }

    public async resolve(): Promise<IResolvedPackage> {
        if (!this.resolveP) {
            this.resolveP = this.resolveCore();
        }

        return this.resolveP;
    }

    public async load<T>(): Promise<T> {
        if (!this.loadP) {
            this.loadP = this.loadCore();
        }

        return this.loadP;
    }

    private async resolveCore(): Promise<IResolvedPackage> {
        let packageJson: IPackage;
        if (typeof this.details.details.package === "string") {
            const response = await fetch(`${this.details.packageUrl}/package.json`);
            packageJson = await response.json() as IPackage;
        } else {
            packageJson = this.details.details.package;
        }

        if (!("fluid" in packageJson)) {
            return Promise.reject("Not a fluid package");
        }

        const fluidPackage = packageJson as IFluidPackage;

        return {
            details: this.details.details,
            packageUrl: this.details.packageUrl,
            parsed: this.details.parsed,
            pkg: fluidPackage,
        };
    }

    private async loadCore<T>(): Promise<T> {
        const resolved = await this.resolve();

        // Currently only support UMD package loads
        const umdDetails = resolved.pkg.fluid.browser.umd;

        await Promise.all(this.scriptManager.loadScripts(umdDetails, this.details.packageUrl));

        // tslint:disable-next-line:no-unsafe-any
        return window[umdDetails.library];
    }
}

export class WebCodeLoader implements ICodeLoader {
    // Cache goes CDN -> package -> entrypoint
    private readonly resolvedCache = new Map<string, FluidPackage>();
    private readonly scriptManager = new ScriptManager();

    constructor(private readonly whiteList: ICodeWhiteList) { }

    public async seed(seedable: ISeedable) {
        const fluidPackage = this.getFluidPackage({ config: seedable.config, package: seedable.package });
        fluidPackage.seed(seedable.scriptIds);
    }

    /**
     * Resolves the input data structures to the resolved details
     */
    // tslint:disable-next-line:promise-function-async disabled to verify function sets cache synchronously
    public resolve(input: IFluidCodeDetails): Promise<IResolvedPackage> {
        const fluidPackage = this.getFluidPackage(input);
        return fluidPackage.resolve();
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load<T>(
        source: IFluidCodeDetails,
    ): Promise<T> {
        if (!(await this.whiteList.testSource(source))) {
            throw new Error("Attempted to load invalid package");
        }
        const fluidPackage = this.getFluidPackage(source);
        return fluidPackage.load();
    }

    private getFluidPackage(input: IFluidCodeDetails): FluidPackage {
        const details = this.getPackageDetails(input);

        if (!this.resolvedCache.has(details.packageUrl)) {
            const resolved = new FluidPackage(details, this.scriptManager);
            this.resolvedCache.set(details.packageUrl, resolved);
        }

        // tslint:disable-next-line:no-non-null-assertion
        return this.resolvedCache.get(details.packageUrl)!;
    }

    private getPackageDetails(details: IFluidCodeDetails): IPackageDetails {

        const fullPkg = typeof details.package === "string"
            ? details.package // just return it if it's a string e.g. "@fluid-example/clicker@0.1.1"
            : !details.package.version // if it doesn't exist, let's make it from the packge detals
                ? `${details.package.name}` // e.g. @fluid-example/clicker
                : `${details.package.name}@${details.package.version}`; // rebuild e.g. @fluid-example/clicker@0.1.1
        const parsed = extractDetails(fullPkg);

        const scriptCdnTag = `${parsed.scope ? `@${parsed.scope}:` : ""}cdn`;
        const cdn = details.config[scriptCdnTag];
        const scopePath = parsed.scope ? `@${encodeURI(parsed.scope)}/` : "";
        const packageUrl = parsed.version !== undefined
            ? `${cdn}/${scopePath}${encodeURI(`${parsed.name}@${parsed.version}`)}`
            : `${cdn}/${scopePath}${encodeURI(`${parsed.name}`)}`;

        return {
            details,
            packageUrl,
            parsed,
        };
    }
}
