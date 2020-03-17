import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";

export interface IPackageIdentifierDetails {
    readonly full: string;
    readonly pkg: string;
    readonly name: string;
    readonly version: string | undefined;
    readonly scope: string;
}

export function extractPackageIdentifierDetails(details: IFluidCodeDetails): IPackageIdentifierDetails {

    const packageString = typeof details.package === "string"
        ? details.package // Just return it if it's a string e.g. "@fluid-example/clicker@0.1.1"
        : !details.package.version // If it doesn't exist, let's make it from the package details
            ? `${details.package.name}` // E.g. @fluid-example/clicker
            : `${details.package.name}@${details.package.version}`; // Rebuild e.g. @fluid-example/clicker@0.1.1

    let full: string;
    let scope: string;
    let pkg: string;
    let name: string;
    let version: string | undefined;

    // Two @ symbols === the package has a version. Use alternative RegEx.
    if (packageString.indexOf("@") !== packageString.lastIndexOf("@")) {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const componentsWithVersion = packageString.match(/(@(.*)\/)?((.*)@(.*))/);
        if ((!componentsWithVersion || componentsWithVersion.length !== 6)) {
            throw new Error("Invalid package");
        }
        [full, , scope, pkg, name, version] = componentsWithVersion;
    } else {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const componentsWithoutVersion = packageString.match(/(@(.*)\/)?((.*))/);
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
