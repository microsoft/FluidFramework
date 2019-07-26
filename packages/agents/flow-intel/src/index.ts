/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/webflow";
import { IComponent, IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import { IntelRunner } from "./intelRunner";

export class TextAnalyzer implements IComponent, IComponentRouter, IComponentRunnable {

    public static supportedInterfaces = ["IComponentRunnable"];

    constructor(
        private readonly document: FlowDocument,
        private readonly insightsMap: ISharedMap) {}

    public query(id: string): any {
        return TextAnalyzer.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return TextAnalyzer.supportedInterfaces;
    }

    public async run() {
        const intelRunner = new IntelRunner(this.document, this.insightsMap);
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
