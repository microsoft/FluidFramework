/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { IntelRunner } from "./intelRunner";

export class TextAnalyzer implements IComponent, IComponentRouter, IComponentRunnable {

    public static supportedInterfaces = ["IComponentRunnable"];

    constructor(
        private readonly sharedString: Sequence.SharedString,
        private readonly insightsMap: ISharedMap) {}

    public query(id: string): any {
        return TextAnalyzer.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return TextAnalyzer.supportedInterfaces;
    }

    public async run() {
        const intelRunner = new IntelRunner(this.sharedString, this.insightsMap);
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
