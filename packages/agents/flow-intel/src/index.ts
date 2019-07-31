/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/webflow";
import {
    IComponent,
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import { ISharedMap } from "@prague/map";
import { IntelRunner, ITokenConfig } from "./intelRunner";

export class TextAnalyzer implements IComponent, IComponentRouter, IComponentRunnable {

    public static supportedInterfaces = ["IComponentRunnable"];

    constructor(
        private readonly document: FlowDocument,
        private readonly insightsMap: ISharedMap,
        private readonly config: ITokenConfig) {}

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    public query(id: string): any {
        return TextAnalyzer.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return TextAnalyzer.supportedInterfaces;
    }

    public async run() {
        if (this.config === undefined || this.config.key === undefined || this.config.key.length === 0) {
            return Promise.reject("No intel key provided.");
        }
        const intelRunner = new IntelRunner(this.document, this.insightsMap, this.config);
        return intelRunner.start();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }
}
