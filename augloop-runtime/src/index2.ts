import * as winston from "winston";
import {AugLoopRuntime, IAugResult, IDocTile, inputSchemaName } from "./augloop-runtime";

async function run(): Promise<void> {
    const inputTexts = [
        "Terible speling",
        "The cat are fat",
        "Everything looks good",
        "Congressman did something stupid",
        `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a
        wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood,
        this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful
        property of some one or other of their daughters.`,
    ];
    const augRuntime = new AugLoopRuntime();
    let index = 0;
    for (const text of inputTexts) {
        const input: IDocTile = {
            content: text,
            documentId: "random-id",
            reqOrd: index,
            requestTime: index,
        };
        ++index;
        augRuntime.submit(input, inputSchemaName);
    }
    augRuntime.on("error", (error) => {
        winston.error(error);
    });
    augRuntime.on("result", (result: IAugResult) => {
        winston.info(JSON.stringify(result));
    });
}

run().catch((error) => {
    winston.error(error);
});
