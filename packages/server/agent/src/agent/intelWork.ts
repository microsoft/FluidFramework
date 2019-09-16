/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import * as Sequence from "@microsoft/fluid-sequence";
import { IComponentHandle } from "@prague/component-core-interfaces";
import { IHost } from "@prague/container-definitions";
import { TextAnalyzer } from "@prague/intelligence-runner";
import { IDocumentServiceFactory } from "@prague/protocol-definitions";
import { BaseWork } from "./baseWork";
import { IWork } from "./definitions";

export class IntelWork extends BaseWork implements IWork {

    constructor(
        alfred: string,
        docId: string,
        tenantId: string,
        host: IHost,
        config: any,
        private serviceFactory: IDocumentServiceFactory) {
        super(alfred, docId, tenantId, host, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { encrypted: undefined, client: { type: "intel"} },
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
            // This is a patch up for our legacy stuff when both agents uses the same map key to populate results.
            // To play nice with back-compat, intel runner creates the map and translator waits on the key.
            if (!insightsMap.has(sharedString.id)) {
                const insightSlot = SharedMap.create(this.document.runtime);
                insightsMap.set(sharedString.id, insightSlot.handle);
                const textAnalyzer = new TextAnalyzer(
                    sharedString,
                    insightsMap,
                    this.config.get("intelligence:textAnalytics"));
                return textAnalyzer.run();
            }
        }
    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
