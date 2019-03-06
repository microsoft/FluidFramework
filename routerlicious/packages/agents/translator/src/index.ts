import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { Translator } from "./translator";

export function run(
    sharedString: Sequence.SharedString,
    insightsMap: ISharedMap,
    apiKey: string) {
    const translator = new Translator(insightsMap, sharedString, apiKey);
    translator.start().catch((err) => {
        console.log(err);
    });
}
