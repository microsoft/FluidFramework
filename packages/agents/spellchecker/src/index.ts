/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentRouter, IRequest, IResponse } from "@prague/container-definitions";
import * as MergeTree from "@prague/merge-tree";
import * as Sequence from "@prague/sequence";
import { loadDictionary } from "./dictionaryLoader";
import { Spellchecker } from "./spellchecker";

export interface ISpellChecker {
    run(sharedString: Sequence.SharedString, dictionary?: MergeTree.TST<number>): void;
}

export class SpellChecker implements IComponent, IComponentRouter, ISpellChecker {

    public static supportedInterfaces = ["ISpellChecker"];

    public query(id: string): any {
        return SpellChecker.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return SpellChecker.supportedInterfaces;
    }

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
