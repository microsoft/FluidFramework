import { Router } from "express";
import * as nconf from "nconf";
import * as git from "../../git-storage";
import * as utils from "../../utils";
import * as storage from "../storage";

const router: Router = Router();

const settings = nconf.get("git");
const gitManager = new git.GitManager(settings.historian, settings.repository);

async function getStorage(id: string, sha: string): Promise<storage.IDocumentSnapshot> {
    const commit = await gitManager.getCommit(sha);
    return storage.getDocumentDetails(gitManager, id, commit);
}

router.get("/:id/:sha", (request, response, next) => {
    const detailsP = getStorage(request.params.id, request.params.sha);
    utils.resolve(detailsP, response);
});

router.get("/:id", (request, response) => {
    const commitsP = gitManager.getCommits(request.params.id, 10);
    const responseP = commitsP.then<any>((commits) => {
        return "versions" in request.query ? commits : getStorage(request.params.id, commits[0].sha);
    });

    utils.resolve(responseP, response);
});

export default router;
