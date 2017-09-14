import { Router } from "express";
import { Provider } from "nconf";
import * as utils from "../../utils";

export function create(config: Provider): Router {
    const router: Router = Router();

    const service = new utils.ResumeIntelligentSerivce(config.get("worker:intelligence:resume"));

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

    return router;
}
