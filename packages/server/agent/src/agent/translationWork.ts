/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@prague/component-core-interfaces";
import { IHost } from "@prague/container-definitions";
import { ISharedMap } from "@microsoft/fluid-map";
import { IDocumentServiceFactory } from "@prague/protocol-definitions";
import * as Sequence from "@microsoft/fluid-sequence";
import { Translator } from "@prague/translator";
import { Provider } from "nconf";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";

export class TranslationWork extends BaseWork implements IWork {

    constructor(
        alfred: string,
        docId: string,
        tenantId: string,
        host: IHost,
        config: Provider,
        private serviceFactory: IDocumentServiceFactory) {
        super(alfred, docId, tenantId, host, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { encrypted: undefined, client: { type: "translation"} },
            this.serviceFactory,
            task);

        // Wait for the document to get fully connected.
        if (!this.document.isConnected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }

        const rootMap = this.document.getRoot();
        const [sharedString, insightsMap] = await Promise.all([
            rootMap.get<IComponentHandle>("text").get<Sequence.SharedString>(),
            rootMap.get<IComponentHandle>("insights").get<ISharedMap>(),
        ]);

        if (sharedString && insightsMap) {
            await insightsMap.wait(sharedString.id);
            const translator = new Translator(
                sharedString,
                insightsMap,
                this.config.get("intelligence:translation"));
            return translator.run();
        }
    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
