import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { SharedStringTranslator } from "./sharedStringTranslator";

export function run(
    sharedString: Sequence.SharedString,
    insightsMap: ISharedMap,
    apiKey: string) {
    const translator = new SharedStringTranslator(insightsMap, sharedString, apiKey);
    translator.start().catch((err) => {
        console.log(err);
    });
}
