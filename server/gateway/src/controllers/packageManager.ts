/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import query from "querystring";
import { IPackage } from "@microsoft/fluid-container-definitions";
import {
    IPackageList,
    IPackageManager,
    IPackument,
    ISearchParams,
    ISearchResult,
} from "@microsoft/fluid-host-service-interfaces";
import Axios from "axios";

export class PackageManager implements IPackageManager {
    public get IPackageManager(): IPackageManager { return this; }

    constructor(
        private readonly endpoint: string,
        private readonly username: string,
        private readonly password: string) {
    }

    public async all(): Promise<IPackageList> {
        return this.request("/-/all");
    }

    public async get(name: string): Promise<IPackument> {
        return this.request(`/${name}`);
    }

    public async getVersion(name: string, version: string): Promise<IPackage> {
        return this.request(`/${name}/${version}`);
    }

    public async search(params: ISearchParams): Promise<ISearchResult> {
        const stringified = query.stringify(params);
        return this.request(`/-/v1/search?${stringified}`);
    }

    private async request<T>(path: string): Promise<T> {
        const response = await Axios.get<T>(
            `${this.endpoint}${path}`,
            {
                auth: {
                    username: this.username,
                    password: this.password,
                },
            });

        return response.data;
    }
}
