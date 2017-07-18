import { Router } from "express";
import * as helper from "../helper"
import * as service from "../service";

const router: Router = Router();

/**
 * Returns spellchecker result for the given string.
 */
router.post("/", async (request, response, next) => {
    const text = request.body.documents[0].text;
    console.info(`Text to check spelling: ${text}`);
    
    // Writes the text to the file that service reads as an input.
    await service.writeFile("../../../../app/ParameterCollection.json", text).catch((error) => {
        response.status(400).json({ error });
    });
    // Invokes the service.
    const result = await service.runCommand("../../../../app", "dotnet editorservicerelay.dll").catch((error) => {
        response.status(400).json({ error });
    });
    // Converts the console output to JSON.
    const resultBody = helper.extractJSON(result);
    response.status(200).json(resultBody);
});

export default router;
