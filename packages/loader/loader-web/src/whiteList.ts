/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeWhiteList, IFluidPackage, IPackageConfig, IResolvedPackage,
} from "@microsoft/fluid-container-definitions";

/**
 * Class used by hosts to allow specific containers and endpoint.
 */
export class WhiteList implements ICodeWhiteList {
    public pkg?: IFluidPackage;
    public config?: IPackageConfig;
    public scriptIds?: string[];

    constructor(
        private readonly testHandler?: (source: IResolvedPackage) => Promise<boolean>,
    ) { }

    public async testSource(source: IResolvedPackage): Promise<boolean> {
        if (!this.testHandler) {
            return true;
        }
        return this.testHandler(source);
    }
}
