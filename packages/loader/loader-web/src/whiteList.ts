/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChaincodeWhiteList, IFluidCodeDetails, IFluidPackage, IPackageConfig,
} from "@microsoft/fluid-container-definitions";

/**
 * Class used by hosts to allow specific containers and endpoint.
 */
export class WhiteList implements IChaincodeWhiteList {
    public pkg?: IFluidPackage;
    public config?: IPackageConfig;
    public scriptIds?: string[];

    constructor(
        private readonly testHandler: (source: IFluidCodeDetails) => Promise<boolean>,
    ) { }

    public async testSource(source: IFluidCodeDetails): Promise<boolean> {
        console.log("WhiteList.test");
        console.log(source);
        return this.testHandler(source);
    }
}
