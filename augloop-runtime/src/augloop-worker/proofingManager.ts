// import { core, MergeTree } from "@prague/routerlicious/dist/client-api";
import { SharedString } from "@prague/routerlicious/dist/shared-string";
import * as winston from "winston";
import { AugLoopRuntime } from "../augloop-runtime";
import { ISlice } from "./definitons";
import { ParagrapgSlicer } from "./paragraphSlicer";

export class ProofingManager {
    constructor(private root: SharedString, private runtime: AugLoopRuntime) {
    }

    public run() {
        this.root.loaded.then(() => {
            const slicer = new ParagrapgSlicer(this.root);
            slicer.on("slice", (slice: ISlice) => {
                winston.info(`Slice: ${slice.range.begin} -> ${slice.range.end}`);
                winston.info(slice.text);
            });
            slicer.run();
            this.runtime.on("result", (data) => {
                winston.info(data);
            });
        });
    }
}
