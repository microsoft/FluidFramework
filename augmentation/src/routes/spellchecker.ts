import { Router } from "express";
import * as service from "../service"

const router: Router = Router();

/**
 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
 */
router.post("/", async (request, response, next) => {
    const text = request.body.documents[0].text;
    console.log(`Text to check: ${text}`);
    await service.writeFile("../../../../app/ParameterCollection.json", text);
    const result = await service.runCommand("../../../../app", "dotnet editorservicerelay.dll");
    const resultBody = extractJSON(result);
    response.status(200).json(resultBody);
});

function extractJSON(str) {
    var firstOpen, firstClose, candidate;
    firstOpen = str.indexOf('{', firstOpen + 1);
    do {
        firstClose = str.lastIndexOf('}');
        if(firstClose <= firstOpen) {
            return null;
        }
        do {
            candidate = str.substring(firstOpen, firstClose + 1);
            try {
                var res = JSON.parse(candidate);
                return res;
            }
            catch(e) {
                console.log(`Failed parsing response JSON.`);
            }
            firstClose = str.substr(0, firstClose).lastIndexOf('}');
        } while(firstClose > firstOpen);
        firstOpen = str.indexOf('{', firstOpen + 1);
    } while(firstOpen != -1);
}

export default router;
