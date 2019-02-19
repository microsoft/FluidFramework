import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { Translator } from "./translator";

export function run(sharedString: Sequence.SharedString, insightsMap: ISharedMap) {
    const translator = new Translator(insightsMap, sharedString);
    translator.start().catch((err) => {
        console.log(err);
    });
}
