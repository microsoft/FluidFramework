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
    isFluidPackage,
    IFluidModule,
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
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const componentsWithVersion = value.match(/(@(.*)\/)?((.*)@(.*))/);
        if ((!componentsWithVersion || componentsWithVersion.length !== 6)) {
            throw new Error("Invalid package");
        }
        [full, , scope, pkg, name, version] = componentsWithVersion;
    } else {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
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

    // Check whether the script is loaded inside a worker.
    public get isBrowser(): boolean {
        if (typeof window === "undefined") {
            return false;
        }
        return window.document !== undefined;
    }

    public async loadScript(scriptUrl: string, scriptId?: string): Promise<void> {
        let scriptP = this.loadCache.get(scriptUrl);
        if (!scriptP) {
            scriptP = new Promise<void>((resolve, reject) => {
                if (this.isBrowser) {
                    const script = document.createElement("script");
                    script.src = scriptUrl;

                    if (scriptId !== undefined) {
                        script.id = scriptId;
                    }

                    // Dynamically added scripts are async by default. By setting async to false, we are enabling the
                    // scripts to be downloaded in parallel, but executed in order. This ensures that a script is
                    // executed after all of its dependencies have been loaded and executed.
                    script.async = false;

                    script.onload = () => resolve();
                    script.onerror = () =>
                        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

                    document.head.appendChild(script);
                } else {
                    import(/* webpackMode: "eager", webpackIgnore: true */ scriptUrl).then(() => {
                        resolve();
                    }, () => {
                        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));
                    });
                }

            });

            this.loadCache.set(scriptUrl, scriptP);
        }

        return scriptP;
    }

    public loadScripts(
        umdDetails: { files: string[]; library: string },
        packageUrl: string,
        scriptIds?: string[],
    ): Promise<void>[] {
        return umdDetails.files.map(async (bundle, index) => {
            // Load file as cdn Link (starts with http)
            // Or create a cdnLink from packageURl
            const url = bundle.startsWith("http")
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
                const scriptElement = document.getElementById(scriptId);
                // eslint-disable-next-line no-null/no-null
                return (scriptElement !== null);
            });

            // If the script hasn't been attached, attach it now, kicking off the load.
            // This could cause a double load of the script, but scriptManager handles duplicates
            if (scriptFound === undefined) {
                this.scriptManager.loadScripts(umdDetails, this.details.packageUrl, scriptIds);
            }

            // ScriptIds are needed here in case the script hasn't loaded yet
            scriptIds.forEach((scriptId) => {
                const scriptElement = document.getElementById(scriptId);

                // eslint-disable-next-line no-null/no-null
                if (scriptElement !== null) {
                    scriptElement.onload = () => {
                        if (entrypoint in window) {
                            resolve(window[entrypoint]);
                        }
                    };

                    scriptElement.onerror = (error) => {
                        reject(error);
                    };
                }
            });
        });
    }

    public async load(): Promise<IFluidModule> {
        if (!this.loadP) {
            this.loadP = this.loadCore();
        }

        return this.loadP;
    }

    private async resolve(): Promise<IResolvedPackage> {
        if (!this.resolveP) {
            this.resolveP = this.resolveCore();
        }

        return this.resolveP;
    }

    private async resolveCore(): Promise<IResolvedPackage> {
        let packageJson: IPackage;
        if (typeof this.details.details.package === "string") {
            const response = await fetch(`${this.details.packageUrl}/package.json`);
            packageJson = await response.json() as IPackage;
        } else {
            packageJson = this.details.details.package;
        }

        if (!isFluidPackage(packageJson)) {
            return Promise.reject(new Error(`Package ${packageJson.name} not a fluid module.`));
        }

        return {
            details: this.details.details,
            packageUrl: this.details.packageUrl,
            parsed: this.details.parsed,
            pkg: packageJson,
        };
    }

    private async loadCore(): Promise<IFluidModule> {
        const resolvedPackage = await this.resolve();

        // Currently only support UMD package loads
        const umdDetails = resolvedPackage.pkg.fluid.browser.umd;

        await Promise.all(this.scriptManager.loadScripts(umdDetails, this.details.packageUrl));

        return this.scriptManager.isBrowser ? window[umdDetails.library] : self[umdDetails.library];
    }
}

export class WebCodeLoader implements ICodeLoader {
    // Cache goes CDN -> package -> entrypoint
    private readonly fluidPackageCache = new Map<string, FluidPackage>();
    private readonly scriptManager = new ScriptManager();

    constructor(private readonly whiteList?: ICodeWhiteList) { }

    public async seed(seedable: ISeedable) {
        if (this.whiteList && !(await this.whiteList.testSource(
            { config: seedable.config, package: seedable.package }))) {
            throw new Error("Attempted to load invalid package");
        }
        const fluidPackage = this.getFluidPackage({ config: seedable.config, package: seedable.package });
        fluidPackage.seed(seedable.scriptIds);
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        if (this.whiteList && !(await this.whiteList.testSource(source))) {
            return Promise.reject("Attempted to load invalid package");
        }
        const fluidPackage = this.getFluidPackage(source);
        return fluidPackage.load();
    }

    private getFluidPackage(input: IFluidCodeDetails): FluidPackage {
        const details = getPackageDetails(input);

        if (!this.fluidPackageCache.has(details.packageUrl)) {
            const resolved = new FluidPackage(details, this.scriptManager);
            this.fluidPackageCache.set(details.packageUrl, resolved);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.fluidPackageCache.get(details.packageUrl)!;
    }
}

function getPackageDetails(details: IFluidCodeDetails): IPackageDetails {
    const fullPkg = typeof details.package === "string"
        ? details.package // Just return it if it's a string e.g. "@fluid-example/clicker@0.1.1"
        : !details.package.version // If it doesn't exist, let's make it from the package details
            ? `${details.package.name}` // E.g. @fluid-example/clicker
            : `${details.package.name}@${details.package.version}`; // Rebuild e.g. @fluid-example/clicker@0.1.1
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
