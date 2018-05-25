import { SharedString } from "@prague/routerlicious/dist/shared-string";
import * as winston from "winston";
import { AugLoopRuntime, IAugResult } from "../augloop-runtime";
import { ISlice } from "./definitons";
import { ParagrapgSlicer } from "./paragraphSlicer";
import { SliceManager } from "./sliceManager";

export class ProofingManager {
    private sliceManager: SliceManager;
    constructor(private root: SharedString, private runtime: AugLoopRuntime) {
    }

    public run() {
        this.root.loaded.then(() => {
            const slicer = new ParagrapgSlicer(this.root);
            this.sliceManager = new SliceManager(this.root, this.runtime);
            this.sliceManager.on("result", (res: IAugResult) => {
                // TODO: Send annotation from here.
                winston.info(JSON.stringify(res));
            });
            this.sliceManager.on("error", (error) => {
                winston.error(error);
            });
            slicer.on("slice", (slice: ISlice) => {
                if (slice.text.length > 0) {
                    this.sliceManager.submit(slice.range.begin, slice.range.end, slice.text);
                }
            });
            slicer.run();
        });
    }
}
