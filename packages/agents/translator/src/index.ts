/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@fluidframework/component-core-interfaces";
import { ISharedMap } from "@fluidframework/map";
import * as Sequence from "@fluidframework/sequence";
import { SharedStringTranslator } from "./sharedStringTranslator";

interface ITokenConfig {
    key: string;
}

export class Translator implements IComponentRouter, IComponentRunnable {
    constructor(
        private readonly sharedString: Sequence.SharedString,
        private readonly insightsMap: ISharedMap,
        private readonly config: ITokenConfig) {}

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    private translator: SharedStringTranslator | undefined;

    public async run() {
        if (this.config === undefined || this.config.key === undefined || this.config.key.length === 0) {
            return Promise.reject("No translation key provided.");
        }
        this.translator = new SharedStringTranslator(this.insightsMap, this.sharedString, this.config.key);
        return this.translator.start();
    }

    public stop() {
        if (this.translator) {
            this.translator.stop();
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
