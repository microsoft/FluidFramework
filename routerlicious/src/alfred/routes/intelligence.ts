import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../../utils";

const service = new utils.ResumeIntelligentSerivce(nconf.get("worker:intelligence:resume"));

const router: Router = Router();

/**
 * Retrieves document for the given id.
 */
router.post("/resume", async (request, response, next) => {
    const text = request.body.documents[0].text;
    const client = await service.getClient();
    service.sendMessage(client, "resumeClassifier", text).then((result) => {
        response.status(200).json(result);
    }, (error) => {
        response.status(500).json(error);
    });
});

export default router;
