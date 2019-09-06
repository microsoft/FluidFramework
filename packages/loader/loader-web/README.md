Example IResolvedPackage

``` TypeScript
import { IFluidPackage, IPackageConfig } from "@prague/container-definitions";
import { IResolvedPackage } from "@prague/loader-web";

const cdnLink = "https://pragueauspkn-3873244262.azureedge.net/@fluid-example/clicker@0.9.11445/dist/main.bundle.js";
const linkedLibraryName = "main";
const scope = "@random";

// tslint:disable: one-variable-per-declaration object-literal-sort-keys
const testPackage: IFluidPackage = {
    name: `${scope}/name`,
    version: "0.0.1",
    fluid: {
        browser: {
            umd: {
                files: [
                    cdnLink,
                ],
                library: linkedLibraryName,
            },
        },
    },
};

const testConfig: IPackageConfig = {
    [`${scope}:cdn`]: cdnLink,
};

export const testResolvedPackage: IResolvedPackage = {
    details: { // IFluidCodeDetails
        package: testPackage,
        config:  testConfig,
    },
    parsed: {
        full: "",
        pkg: "",
        name: "",
        version: "",
        scope: scope,
    },
    pkg: testPackage,
    packageUrl: "",
};
``` 