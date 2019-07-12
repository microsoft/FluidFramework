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
    version: string;
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
    const components = value.match(/(@(.*)\/)?((.*)@(.*))/);
    if (!components || components.length !== 6) {
        throw new Error("Invalid package");
    }

    const [full, , scope, pkg, name, version] = components;
    return {
        full,
        name,
        pkg,
        scope,
        version,
    };
}

export function normalize(defaultCdn: string, input: string | IFluidCodeDetails): IFluidCodeDetails {
    let source: IFluidCodeDetails;
    if (typeof input === "string") {
        const details = extractDetails(input);
        source = {
            config: {
                [`@${details.scope}:cdn`]: defaultCdn,
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
    public loadScript(scriptUrl: string): Promise<void> {
        if (!this.loadCache.has(scriptUrl)) {
            const scriptP = new Promise<void>((resolve, reject) => {
                const script = document.createElement("script");
                script.src = scriptUrl;

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
}

class FluidPackage {
    private resolveP: Promise<IResolvedPackage> | undefined;
    private loadP: Promise<any> | undefined;

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
        this.loadP = new Promise<any>((resolve, reject) => {
            if (entrypoint in window) {
                resolve(window[entrypoint]);
            }

            scriptIds.forEach((scriptId) => {
                const script = document.getElementById(scriptId) as HTMLScriptElement;
                script.onload = () => {
                    if (entrypoint in window) {
                        resolve(window[entrypoint]);
                    }
                };

                script.onerror = (error) => {
                    reject(error);
                };
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
            return Promise.reject("Not a fluid pacakge");
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

        await Promise.all(
            umdDetails.files.map(async (bundle) => {
                const url = bundle.indexOf("http") === 0
                    ? bundle
                    : `${this.details.packageUrl}/${bundle}`;
                return this.scriptManager.loadScript(url);
            }));

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
        const details = normalize(this.baseUrl, input);

        const fullPkg = typeof details.package === "string"
            ? details.package
            : `${details.package.name}@${details.package.version}`;
        const parsed = extractDetails(fullPkg);

        const cdn = details.config[`${parsed.scope ? `@${parsed.scope}:` : ""}cdn`];
        const scopePath = parsed.scope ? `@${encodeURI(parsed.scope)}/` : "";
        const packageUrl =
            `${cdn}/${scopePath}${encodeURI(`${parsed.name}@${parsed.version}`)}`;

        return {
            details,
            packageUrl,
            parsed,
        };
    }
}
