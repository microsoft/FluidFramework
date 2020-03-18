/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails,IFluidPackageResolver, IPackage, IResolvedFluidCodeDetails, isFluidPackage,
} from "@microsoft/fluid-container-definitions";
import {extractPackageIdentifierDetails} from "@microsoft/fluid-web-code-loader";
import * as fetch from "isomorphic-fetch";


class FluidPackage {
    private resolveP: Promise<IResolvedFluidCodeDetails> | undefined;

    constructor(private readonly codeDetails: IFluidCodeDetails, private readonly packageUrl: string){}

    public async resolve(): Promise<IResolvedFluidCodeDetails> {
        if (this.resolveP === undefined) {
            this.resolveP = this.resolveCore();
        }

        return this.resolveP;
    }

    private async resolveCore(): Promise<IResolvedFluidCodeDetails> {
        let packageJson: IPackage;
        if (typeof this.codeDetails.package === "string") {
            const response = await fetch(`${this.packageUrl}/package.json`);
            packageJson = await response.json() as IPackage;
        } else {
            packageJson = this.codeDetails.package;
        }

        if (!isFluidPackage(packageJson)) {
            throw new Error(`Package ${packageJson.name} not a fluid module.`);
        }

        return {
            config: this.codeDetails.config,
            package: this.codeDetails.package,
            resolvedPackageUrl: this.packageUrl,
            resolvedPackage: packageJson,
        };
    }
}

export class VerdaccioPackageResolver implements IFluidPackageResolver{
    // Cache goes CDN -> package -> entrypoint
    private readonly fluidPackageCache = new Map<string, FluidPackage>();

    public async resolve(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails> {
        const parsed = extractPackageIdentifierDetails(details.package);

        const cdn = details.config[`@${parsed.scope}:cdn`] ?? details.config.cdn;
        const scopePath = parsed.scope ? `@${encodeURI(parsed.scope)}/` : "";
        const packageUrl = parsed.version !== undefined
            ? `${cdn}/${scopePath}${encodeURI(`${parsed.name}@${parsed.version}`)}`
            : `${cdn}/${scopePath}${encodeURI(`${parsed.name}`)}`;

        if (!this.fluidPackageCache.has(packageUrl)) {
            const resolved = new FluidPackage(details, packageUrl);
            this.fluidPackageCache.set(packageUrl, resolved);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.fluidPackageCache.get(packageUrl)!.resolve();
    }
}
