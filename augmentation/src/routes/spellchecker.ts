import { queue } from "async";
import { Router } from "express";
import * as helper from "../helper"
import * as service from "../service";

interface ITask {
    // Request text to spellcheck.
    text: string;

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
    console.info(`Text to check spelling: ${task.text}`);
    const resultP = processRequest(task.text);
    resultP.then((result) => {
        task.response.status(200).json(result);
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
    q.push( {text, response});
});

export default router;
