import * as git from "@prague/gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

// TODO we used to return an ICommit as a result of ther GET call, rather than the correct ICommitDetails.
// To maintain backwards compatibility we return a union of both types.
export interface IUnionedCommit {
    author: git.IAuthor;
    commit: {
        url: string;
        author: git.IAuthor;
        committer: git.ICommitter;
        message: string;
        tree: git.ICommitHash;
    };
    committer: git.ICommitter;
    message: string;
    parents: git.ICommitHash[];
    sha: string;
    tree: git.ICommitHash;
    url: string;
}

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.get(provider.translatePath("/repos/:owner?/:repo/commits"), (request, response, next) => {
        const commitsP = provider.gitService.getCommits(
            request.params.owner,
            request.params.repo,
            request.query.sha,
            request.query.count);

        const resultsP = commitsP.then((commits) => {
            // Return an IUnionedCommit for backwards compatibility (see IUnionedCommit definition for details)
            return commits.map((commit) => {
                return {
                    author: commit.commit.author,
                    commit: {
                        author: commit.commit.author,
                        committer: commit.commit.committer,
                        message: commit.commit.message,
                        tree: commit.commit.tree,
                        url: commit.commit.url,
                    },
                    committer: commit.commit.committer,
                    message: commit.commit.message,
                    parents: commit.parents,
                    sha: commit.sha,
                    tree: commit.commit.tree,
                    url: commit.url,
                } as IUnionedCommit;
            });
        });

        utils.handleResponse(
            resultsP,
            response,
            false);
    });

    return router;
}
