import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { IntelRunner } from "./intelRunner";

export function run(sharedString: Sequence.SharedString, insightsMap: ISharedMap) {
    const intelRunner = new IntelRunner(sharedString, insightsMap);
    intelRunner.start().catch((err) => {
        console.log(err);
    });
}
