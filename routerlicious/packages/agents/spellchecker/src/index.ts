import * as Sequence from "@prague/sequence";
import { loadDictionary } from "./dictionaryLoader";
import { Spellcheker } from "./spellchecker";

export function run(sharedString: Sequence.SharedString) {
    loadDictionary("https://alfred.wu2-ppe.prague.office-int.com").then((dict) => {
        const spellchecker = new Spellcheker(sharedString, dict);
        spellchecker.run();
    }, (error) => {
        console.log(error);
    });
}
