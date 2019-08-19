/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IFluidCodeDetails,
    IFluidPackage,
    IPackage,
    IPackageConfig,
    IPraguePackage,
} from "@prague/container-definitions";
import * as fetch from "isomorphic-fetch";

export interface IParsedPackage {
    full: string;
    pkg: string;
    name: string;
    version: string | undefined;
    scope: string;
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
 * Normalize any input into IFluidCodeDetails format
 * @param inputEither - a string, which is pkgName[at]versionNumber or the full code details
 * @param defaultCdn - If !(input is IFluidCodeDetails), this is where we'll look up the cdn
 */
export function normalize(input: string | IFluidCodeDetails, defaultCdn?: string): IFluidCodeDetails {
    let source: IFluidCodeDetails;
    if (typeof input === "string") {
        const details = extractDetails(input);
        source = {
            config: {
                // tslint:disable-next-line: no-non-null-assertion
                [`@${details.scope}:cdn`]: defaultCdn!,
            },
            package: input,
        };
    } else {
        source = input;
    }

    return source;
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
            // This could cause a double load of the scrip, but scriptManager handles duplicates
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
        // Load or normalize to a Fluid package
        let packageJson: IPackage;
        if (typeof this.details.details.package === "string") {
            const response = await fetch(`${this.details.packageUrl}/package.json`);
            packageJson = await response.json() as IPackage;
        } else {
            packageJson = this.details.details.package;
        }

        if (!("fluid" in packageJson || "prague" in packageJson)) {
            return Promise.reject("Not a fluid package");
        }

        const fluidPackage = packageJson as IFluidPackage;
        if (!("fluid" in packageJson)) {
            const praguePackage = packageJson as IPraguePackage;
            fluidPackage.fluid = {
                browser: {
                    umd: {
                        files: praguePackage.prague.browser.bundle,
                        library: praguePackage.prague.browser.entrypoint,
                    },
                },
            };
        }

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

export class WebLoader implements ICodeLoader {
    // Cache goes CDN -> package -> entrypoint
    private readonly resolvedCache = new Map<string, FluidPackage>();
    private readonly scriptManager = new ScriptManager();

    constructor(private readonly baseUrl: string) {
    }

    public seed(pkg: IFluidPackage, config: IPackageConfig, scriptIds: string[]) {
        const fluidPackage = this.getFluidPackage({ config, package: pkg });
        fluidPackage.seed(scriptIds);
    }

    /**
     * Resolves the input data structures to the resolved details
     */
    // tslint:disable-next-line:promise-function-async disabled to verify function sets cache synchronously
    public resolve(input: string | IFluidCodeDetails): Promise<IResolvedPackage> {
        const fluidPackage = this.getFluidPackage(input);
        return fluidPackage.resolve();
    }

    /**
     * @param source - New: Details of where to find chaincode
     *                  Old: a string of packageName[at]versionNumber to be looked up
     * @param details - Duplicate, Details of where to find chaincode
     */
    public async load<T>(
        source: string | IFluidCodeDetails,
        details?: IFluidCodeDetails,
    ): Promise<T> {
        const input = details ? details : source;
        const fluidPackage = this.getFluidPackage(input);
        return fluidPackage.load();
    }

    private getFluidPackage(input: string | IFluidCodeDetails): FluidPackage {
        const details = this.getPackageDetails(input);

        if (!this.resolvedCache.has(details.packageUrl)) {
            const resolved = new FluidPackage(details, this.scriptManager);
            this.resolvedCache.set(details.packageUrl, resolved);
        }

        // tslint:disable-next-line:no-non-null-assertion
        return this.resolvedCache.get(details.packageUrl)!;
    }

    private getPackageDetails(input: string | IFluidCodeDetails): IPackageDetails {
        // Only need input the code details, baseURl is for old input format only
        const details = normalize(input, (typeof input === "string" ? this.baseUrl : undefined));

        const fullPkg = typeof details.package === "string"
            ? details.package // just return it if it's a string e.g. "@chaincode/clicker@0.1.1"
            : !details.package.version // if it doesn't exist, let's make it from the packge detals
                ? `${details.package.name}` // e.g. @chaincode/clicker
                : `${details.package.name}@${details.package.version}`; // reconstitute e.g. @chaincode/clicker@0.1.1.
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
