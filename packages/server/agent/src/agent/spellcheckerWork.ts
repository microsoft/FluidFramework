/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@prague/component-core-interfaces";
import { IHost } from "@prague/container-definitions";
import * as MergeTree from "@prague/merge-tree";
import { IDocumentServiceFactory } from "@prague/protocol-definitions";
import * as Sequence from "@prague/sequence";
import {SpellChecker} from "@fluid-example/spellchecker-agent";
import { BaseWork } from "./baseWork";
import { IWork } from "./definitions";

export class SpellcheckerWork extends BaseWork implements IWork {

    constructor(
        alfred: string,
        docId: string,
        tenantId: string,
        host: IHost,
        config: any,
        private dictionary: MergeTree.TST<number>,
        private serviceFactory: IDocumentServiceFactory) {

        super(alfred, docId, tenantId, host, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            {
                blockUpdateMarkers: true,
                client: { type: "spell" },
                encrypted: undefined,
            },
            this.serviceFactory,
            task);

        // Wait for the document to get fully connected.
        if (!this.document.isConnected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }

        const rootMap = this.document.getRoot();
        const sharedString = await rootMap.get<IComponentHandle>("text").get<Sequence.SharedString>();

        if (sharedString) {
            const speller = new SpellChecker();
            speller.run(sharedString, this.dictionary);
        }
    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
