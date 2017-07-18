import { Router } from "express";
import * as helper from "../helper"
import * as service from "../service";

const router: Router = Router();

/**
 * Writes to input file and invokes spellchecker service.
 */
async function processReuqest(text: string): Promise<any> {
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

/**
 * Returns spellchecker result for the given string.
 */
router.post("/", async (request, response, next) => {
    const text = request.body.documents[0].text;
    console.info(`Text to check spelling: ${text}`);
    const resultP = processReuqest(text);
    resultP.then((result) => {
        response.status(200).json(result);
    }, (error) => {
        response.status(400).json({ error });
    });
});

export default router;
