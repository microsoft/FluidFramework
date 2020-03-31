/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPackage } from "@microsoft/fluid-container-definitions";

export interface IPackument {
    _attachments: any;
    _id: string;
    _rev: string;
    author: {
        email: string;
        name: string;
    };
    description: string;
    "dist-tags": { [key: string]: string };
    license: string;
    maintainers: { email: string; name: string }[];
    name: string;
    readme: string;
    readmeFilename: string;
    time: {
        [version: string]: string;
        created: string;
        modified: string;
    };
    versions: { [version: string]: IPackage };
}

export const IPackageManager = "IPackageManager";

export interface IProvidePackageManager {
    readonly [IPackageManager]: IPackageManager;
}

export interface ISearchParams {
    text: string;
    size: number;
    from: number;
    quality: number;
    popularity: number;
    maintenance: number;
}

export interface IPackageList {
    [name: string]: IPackument;
}

export interface ISearchResult {
    objects: {
        package: IPackage;
        score: {
            final: number;
            detail: {
                quality: number;
                popularity: number;
                maintenance: number;
            };
        };
        searchScore: number;
    }[];
    total: number;
    time: string;
}

export interface IPackageManager extends IProvidePackageManager {
    /**
     * Retrieves a list of all packages managed by the package manager
     */
    all(): Promise<IPackageList>;

    /**
     * Gets the "packument" for the given package name
     */
    get(name: string): Promise<IPackument>;

    /**
     * Retrieves a specific version of the package.
     */
    getVersion(name: string, version: "latest" | string): Promise<IPackage>;

    /**
     * Performs a search over the package manager
     */
    search(params: ISearchParams): Promise<ISearchResult>;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvidePackageManager>> { }
}
