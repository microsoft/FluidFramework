/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter, IRequest, IResponse } from "@prague/component-core-interfaces";
import * as MergeTree from "@prague/merge-tree";
import * as Sequence from "@prague/sequence";
import { loadDictionary } from "./dictionaryLoader";
import { Spellchecker } from "./spellchecker";

export interface ISpellChecker {
    run(sharedString: Sequence.SharedString, dictionary?: MergeTree.TST<number>): void;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent {
        ISpellChecker?: ISpellChecker;
    }
}

export class SpellChecker implements IComponentRouter, ISpellChecker {

    public get IComponentRouter() { return this; }
    public get ISpellChecker() { return this; }

    public run(sharedString: Sequence.SharedString, dictionary?: MergeTree.TST<number>) {
        this.runSpellchecker(sharedString, dictionary).catch((err) => {
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

    private async runSpellchecker(
        sharedString: Sequence.SharedString,
        dictionary?: MergeTree.TST<number>): Promise<void> {
        const dict = dictionary ? dictionary : await loadDictionary("https://alfred.wu2-ppe.prague.office-int.com");
        const spellchecker = new Spellchecker(sharedString, dict);
        spellchecker.checkSharedString();
    }

}
