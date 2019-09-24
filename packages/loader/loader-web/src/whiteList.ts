/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails, IWhiteList,
} from "@microsoft/fluid-container-definitions";

/**
 * Class used by hosts to allow specific containers and endpoint.
 */
export class WhiteList implements IWhiteList {
    constructor(private readonly testHandler: (source: string | IFluidCodeDetails) => Promise<boolean>) { }

    public async test(source: string | IFluidCodeDetails): Promise<boolean> {
        console.log("WhiteList.test");
        console.log(source);
        return this.testHandler(source);
        // return true;
    }

    // Should the white list handle the seeding as well?
}
