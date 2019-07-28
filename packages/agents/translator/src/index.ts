/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { SharedStringTranslator } from "./sharedStringTranslator";

export class Translator implements IComponent, IComponentRouter, IComponentRunnable {

    public static supportedInterfaces = ["IComponentRunnable"];

    constructor(
        private readonly sharedString: Sequence.SharedString,
        private readonly insightsMap: ISharedMap,
        private readonly apiKey: string) {}

    public query(id: string): any {
        return Translator.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return Translator.supportedInterfaces;
    }

    public async run() {
        if (!this.apiKey || this.apiKey.length === 0) {
            return Promise.reject("No translation key provided.");
        }
        const translator = new SharedStringTranslator(this.insightsMap, this.sharedString, this.apiKey);
        return translator.start();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }
}
