/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/webflow";
import { IComponent, IComponentRouter, IRequest, IResponse } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import { IntelRunner } from "./intelRunner";

export interface ITextAnalyzer {
    run(document: FlowDocument, insightsMap: ISharedMap): void;
}

export class TextAnalyzer implements IComponent, IComponentRouter, ITextAnalyzer {

    public static supportedInterfaces = ["ITextAnalyzer"];

    public query(id: string): any {
        return TextAnalyzer.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return TextAnalyzer.supportedInterfaces;
    }

    public run(document: FlowDocument, insightsMap: ISharedMap) {
        const intelRunner = new IntelRunner(document, insightsMap);
        intelRunner.start().catch((err) => {
            console.log(err);
        });
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }
}
