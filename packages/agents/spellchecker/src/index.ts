import * as MergeTree from "@prague/merge-tree";
import * as Sequence from "@prague/sequence";
import { loadDictionary } from "./dictionaryLoader";
import { Spellchecker } from "./spellchecker";

export function run(sharedString: Sequence.SharedString, dictionary?: MergeTree.TST<number>) {
    runSpellchecker(sharedString, dictionary).catch((err) => {
        console.log(err);
    });
}

async function runSpellchecker(sharedString: Sequence.SharedString, dictionary?: MergeTree.TST<number>): Promise<void> {
    const dict = dictionary ? dictionary : await loadDictionary("https://alfred.wu2-ppe.prague.office-int.com");
    const spellchecker = new Spellchecker(sharedString, dict);
    spellchecker.checkSharedString();
}
