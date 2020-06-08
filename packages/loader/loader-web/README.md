# Example IResolvedPackage

``` TypeScript
import { IFluidPackage, IPackageConfig } from "@fluidframework/container-definitions";
import { IResolvedPackage } from "@fluidframework/web-code-loader";

const cdnLink = "https://pragueauspkn.azureedge.net/@fluid-example/clicker@0.9.11445/dist/main.bundle.js";
const linkedLibraryName = "main";
const scope = "@random";

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
