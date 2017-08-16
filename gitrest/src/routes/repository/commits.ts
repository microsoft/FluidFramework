import { Router } from "express";
import * as nconf from "nconf";
import * as git from "nodegit";
import * as resources from "../../resources";
import * as utils from "../../utils";

async function getCommits(
    repoManager: utils.RepositoryManager,
    repo: string,
    ref: string): Promise<resources.ICommit[]> {

    const repository = await repoManager.open(repo);
    const walker = git.Revwalk.create(repository);

    // tslint:disable-next-line:no-bitwise
    walker.sorting(git.Revwalk.SORT.TOPOLOGICAL | git.Revwalk.SORT.TIME);

    // Lookup the commits specified from the given revision
    const revObj = await git.Revparse.single(repository, ref);
    walker.push(revObj.id());
    const commits = await walker.getCommits(10);

    return await Promise.all(commits.map((commit) => resources.commitToICommit(commit)));
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/repos/commits/
    // sha
    // path
    // author
    // since
    // until
    router.get("/repos/:repo/commits", (request, response, next) => {
        const resultP = getCommits(repoManager, request.params.repo, request.query.sha);
        return resultP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
