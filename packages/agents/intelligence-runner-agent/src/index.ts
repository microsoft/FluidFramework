/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidRouter, IFluidRunnable, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { ISharedMap } from "@fluidframework/map";
import * as Sequence from "@fluidframework/sequence";
import { IntelRunner, ITokenConfig } from "./intelRunner";

export class TextAnalyzer implements IFluidRouter, IFluidRunnable {
    public get IFluidRouter() { return this; }
    public get IFluidRunnable() { return this; }

    private intelRunner: IntelRunner | undefined;

    constructor(
        private readonly sharedString: Sequence.SharedString,
        private readonly insightsMap: ISharedMap,
        private readonly config: ITokenConfig) { }

    public async run() {
        if (this.config === undefined || this.config.key === undefined || this.config.key.length === 0) {
            throw new Error("No intel key provided.");
        }
        this.intelRunner = new IntelRunner(this.sharedString, this.insightsMap, this.config);
        return this.intelRunner.start();
    }

    public stop() {
        if (this.intelRunner) {
            this.intelRunner.stop();
        }
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
}
