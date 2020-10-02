/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails, IFluidCodeResolver, IResolvedFluidCodeDetails,
} from "@fluidframework/container-definitions";
import fetch from "isomorphic-fetch";
import { extractPackageIdentifierDetails, isFluidBrowserPackage, resolveFluidPackageEnvironment } from "./utils";

class FluidPackage {
    private resolveP: Promise<IResolvedFluidCodeDetails> | undefined;

    constructor(private readonly codeProposal: IFluidCodeDetails, private readonly packageUrl: string) { }

    public async resolve(): Promise<IResolvedFluidCodeDetails> {
        if (this.resolveP === undefined) {
            this.resolveP = this.resolveCore();
        }

        return this.resolveP;
    }

    private async resolveCore(): Promise<IResolvedFluidCodeDetails> {
        let maybePkg: any;
        if (typeof this.codeProposal.package === "string") {
            const response = await fetch(`${this.packageUrl}/package.json`);
            maybePkg = await response.json();
        } else {
            maybePkg = this.codeProposal.package;
        }

        if (!isFluidBrowserPackage(maybePkg)) {
            throw new Error(`Package ${maybePkg?.name} not a Fluid module.`);
        }
        const browser = resolveFluidPackageEnvironment(
            maybePkg.fluid.browser, this.packageUrl);

        return {
            ... this.codeProposal,
            resolvedPackage: {
                ... maybePkg,
                fluid:{
                    browser,
                },
            },
            cacheId: this.packageUrl,
        };
    }
}

/**
 * This code resolver works against cdns that support semantic versioning in the url path of the format:
 * `cdn_base/@package_scope?/package_name@package_version`
 *
 * The `@package_scope?` is optional, and only needed it the package has a scope.
 * The `package_version` can be an npm style semantic version.
 *
 * The `cdn_base` is provided in the config of the Fluid code details, as either a global `config.cdn` property, or
 * a per scope cdn, `config["@package_scope:cdn"]`. A scope specific cdn base will take precedence over
 * the global cdn.
 */
export class SemVerCdnCodeResolver implements IFluidCodeResolver {
    // Cache goes CDN -> package -> entrypoint
    private readonly fluidPackageCache = new Map<string, FluidPackage>();

    public async resolveCodeDetails(proposal: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails> {
        const parsed = extractPackageIdentifierDetails(proposal.package);

        const cdn = proposal.config[`@${parsed.scope}:cdn`] ?? proposal.config.cdn;
        const scopePath = parsed.scope !== undefined && parsed.scope.length > 0 ? `@${encodeURI(parsed.scope)}/` : "";
        const packageUrl = parsed.version !== undefined
            ? `${cdn}/${scopePath}${encodeURI(`${parsed.name}@${parsed.version}`)}`
            : `${cdn}/${scopePath}${encodeURI(`${parsed.name}`)}`;

        if (!this.fluidPackageCache.has(packageUrl)) {
            const resolved = new FluidPackage(proposal, packageUrl);
            this.fluidPackageCache.set(packageUrl, resolved);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.fluidPackageCache.get(packageUrl)!.resolve();
    }
}
