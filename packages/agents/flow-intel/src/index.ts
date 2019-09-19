/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/webflow";
import { ISharedMap } from "@microsoft/fluid-map";
import { IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@prague/component-core-interfaces";
import { IntelRunner, ITokenConfig } from "./intelRunner";

export class TextAnalyzer implements IComponentRouter, IComponentRunnable {

    constructor(
        private readonly document: FlowDocument,
        private readonly insightsMap: ISharedMap,
        private readonly config: ITokenConfig) {}

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    public async run() {
        if (this.config === undefined || this.config.key === undefined || this.config.key.length === 0) {
            return Promise.reject("No intel key provided.");
        }
        const intelRunner = new IntelRunner(this.document, this.insightsMap, this.config);
        return intelRunner.start();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}
