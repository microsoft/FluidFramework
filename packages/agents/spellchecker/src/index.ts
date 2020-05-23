/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter, IRequest, IResponse } from "@fluidframework/component-core-interfaces";
import * as MergeTree from "@fluidframework/merge-tree";
import * as Sequence from "@fluidframework/sequence";
import { loadDictionary } from "./dictionaryLoader";
import { Spellchecker } from "./spellchecker";

export const ISpellChecker: keyof IProvideSpellChecker = "ISpellChecker";

export interface IProvideSpellChecker {
    readonly ISpellChecker: ISpellChecker;
}

export interface ISpellChecker extends IProvideSpellChecker {
    run(sharedString: Sequence.SharedString, dictionary?: MergeTree.TST<number>): void;
}

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideSpellChecker>> { }
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
            mimeType: "fluid/component",
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
