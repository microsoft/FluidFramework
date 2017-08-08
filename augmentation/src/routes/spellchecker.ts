import { queue } from "async";
import { Router } from "express";
import * as helper from "../helper"
import * as service from "../service";

interface ITask {
    // Request text to spellcheck.
    text: string;

    // Reference sequence number.
    rsn: number;

    // Start position.
    start: number;

    // End position
    end: number;

    // Response associated with the request.
    response: any;
};

const router: Router = Router();

/**
 * Writes to input file and invokes spellchecker service.
 */
async function processRequest(text: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        service.writeFile("../../../../app/ParameterCollection.json", text).then(() => {
            service.runCommand("../../../../app", "dotnet editorservicerelay.dll").then((data) => {
                    // Converts the console output to JSON.
                    resolve(helper.extractJSON(data));
            }, (error) => {
                reject(error)
            });
        }, (error) => {
            reject(error);
        });
    });
}

// queue to process requests sequentially. Callback invoked to process the next request for both success/error case.
const q = queue((task: ITask, callback) => {
    console.info(`Quere Object -> Text: ${task.text} RSN: ${task.rsn} Start: ${task.start} End: ${task.end}`);
    const resultP = processRequest(task.text);
    resultP.then((result) => {
        task.response.status(200).json({
            answer: result,
            text: task.text,
            rsn: task.rsn,
            start: task.start,
            end: task.end
        });
        callback();
    }, (error) => {
        task.response.status(400).json({ error });
        callback();
    });
}, 1);

/**
 * Returns spellchecker result for the given string.
 */
router.post("/", async (request, response, next) => {
    const text = request.body.documents[0].text;
    const rsn = request.body.documents[0].rsn;
    const start = request.body.documents[0].start;
    const end = request.body.documents[0].end;
    q.push( {text, rsn, start, end, response});
});

export default router;
