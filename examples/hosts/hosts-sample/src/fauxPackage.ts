/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidHTMLOptions,
    IFluidHTMLView,
} from "@fluidframework/view-interfaces";
import {
    IFluidCodeDetails,
    IFluidCodeDetailsComparer,
    IFluidPackage,
} from "@fluidframework/core-interfaces";
import {
    ICodeLoader,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";

/** A placeholder data object used to render an HTML element when it is mounted by the host. */
class FauxComponent extends DataObject implements IFluidHTMLView {
    private _componentEl: HTMLElement | undefined;
    public static readonly Factory = new DataObjectFactory(
        "FauxComponent",
        FauxComponent as any,
        [],
        {},
        [],
    );
    render(parentEl: HTMLElement, options?: IFluidHTMLOptions) {
        this._componentEl = document.createElement("div");
        this._componentEl.style.padding = "2pt 10pt";
        this._componentEl.style.background = "lightyellow";
        this._componentEl.style.margin = "2pt";
        const title = document.createElement("h1");
        title.innerText = "✨ Hello, host! ✨";
        this._componentEl.appendChild(title);
        parentEl.appendChild(this._componentEl);
    }
    get IFluidHTMLView() {
        return this;
    }
    dispose() {
        this._componentEl?.remove();
        super.dispose();
    }
}

const fauxPackageName = "@fluid-example/faux-package";

export const fauxPackageDetailsV1: IFluidCodeDetails = {
    package: {
        name: fauxPackageName,
        version: "1.0.0",
        fluid: { browser: {} },
    },
    config: {},
};

/** A factory method for a code loader emulating a package feed */
export const fauxPackageCodeLoaderForVersion = (version: string = "1.0.0") => {
    const fauxPackageDetailsLatest: IFluidCodeDetails = {
        package: {
            name: fauxPackageName,
            version,
            fluid: { browser: {} },
        },
        config: {},
    };

    const isFauxPackage = (
        pkg: string | Readonly<IFluidPackage>,
    ): pkg is IFluidPackage => {
        return typeof pkg === "object" && pkg.name === fauxPackageName;
    };

    const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
        FauxComponent.Factory,
        new Map([FauxComponent.Factory.registryEntry]),
    );

    return new (class implements ICodeLoader, IFluidCodeDetailsComparer {
        async load(
            source: IFluidCodeDetails,
        ): Promise<IFluidModuleWithDetails> {
            if (!isFauxPackage(source.package)) {
                throw new Error("Unsupported package");
            }
            const module = {
                fluidExport,
            };
            const details = semver.gte(
                version, // candidate
                source.package.version as string, // constraint
            )
                ? fauxPackageDetailsLatest
                : source;
            return { module, details };
        }
        get IFluidCodeDetailsComparer() {
            return this;
        }
        async satisfies(
            candidate: IFluidCodeDetails,
            constraint: IFluidCodeDetails,
        ): Promise<boolean> {
            if (
                !isFauxPackage(candidate.package) ||
                !isFauxPackage(constraint.package)
            ) {
                return false;
            }
            return semver.gte(
                candidate.package.version as string,
                constraint.package.version as string,
            );
        }
        async compare(
            a: IFluidCodeDetails,
            b: IFluidCodeDetails,
        ): Promise<number | undefined> {
            if (
                typeof a.package !== "object" ||
                typeof b.package !== "object" ||
                a.package.name !== b.package.name
            ) {
                return undefined;
            }
            const versionA = a.package.version as string;
            const versionB = b.package.version as string;
            return semver.lt(versionA, versionB)
                ? -1
                : semver.gt(versionA, versionB)
                ? 1
                : 0;
        }
    })();
};
