/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@fluid-example/webflow";
import { IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import { IntelRunner, ITokenConfig } from "./intelRunner";

export class TextAnalyzer implements IComponentRouter, IComponentRunnable {
    constructor(
        private readonly document: FlowDocument,
        private readonly insightsMap: ISharedMap,
        private readonly config: ITokenConfig) { }

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    private intelRunner: IntelRunner | undefined;

    public async run() {
        if (this.config === undefined || this.config.key === undefined || this.config.key.length === 0) {
            throw new Error("No intel key provided.");
        }
        this.intelRunner = new IntelRunner(this.document, this.insightsMap, this.config);
        return this.intelRunner.start();
    }

    public stop() {
        if (this.intelRunner) {
            this.intelRunner.stop();
        }
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}
