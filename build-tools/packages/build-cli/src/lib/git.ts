/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SimpleGit, SimpleGitOptions, simpleGit } from "simple-git";

import { CommandLogger } from "../logging";

/**
 * Default options passed to the git client.
 */
const defaultGitOptions: Partial<SimpleGitOptions> = {
    baseDir: process.cwd(),
    binary: "git",
    maxConcurrentProcesses: 6,
    trimmed: true,
};

/**
 * A small wrapper around a git repo to provide API access to it.
 *
 * @remarks
 *
 * Eventually this should replace the legacy GitRepo class in build-tools. That class exec's git commands directly,
 * while this class uses a library wrapper around git instead.
 *
 * @internal
 */
export class Repository {
    private readonly git: SimpleGit;

    /**
     * A git client for the repository that can be used to call git directly.
     *
     * @internal
     */
    public get gitClient(): SimpleGit {
        return this.git;
    }

    constructor(
        public readonly rootPath: string,
        gitOptions?: Partial<SimpleGitOptions>,
        protected readonly log?: CommandLogger,
    ) {
        this.git = simpleGit(gitOptions ?? defaultGitOptions);
    }

    /**
     * Returns the SHA hash for a branch. If a remote is provided, the SHA for the remote ref is returned.
     */
    public async getShaForBranch(branch: string, remote?: string): Promise<string> {
        const refspec =
            remote === undefined ? `refs/heads/${branch}` : `refs/remotes/${remote}/${branch}`;
        const result = await this.git.raw(`show-ref`, refspec);

        return result;
    }

    /**
     * Get the remote based on the partial Url. It will match the first remote that contains the partialUrl case
     * insensitively.
     *
     * @param partialUrl - partial url to match case insensitively
     */
    public async getRemote(partialUrl: string): Promise<string | undefined> {
        const lowerPartialUrl = partialUrl.toLowerCase();
        const remotes = await this.git.getRemotes(/* verbose */ true);

        for (const r of remotes) {
            if (r.refs.fetch.toLowerCase().includes(lowerPartialUrl)) {
                return r.name;
            }
        }
    }

    async isBranchUpToDate(branch: string, remote: string): Promise<boolean> {
        const { updated } = await this.git.fetch(remote, branch);

        this.log?.info(JSON.stringify(updated));

        const currentSha = await this.getShaForBranch(branch);
        this.log?.verbose(`${branch} branch sha: ${currentSha}`);

        const remoteSha = await this.getShaForBranch(branch, remote);
        this.log?.verbose(`remote branch sha: ${remoteSha}`);

        return remoteSha === currentSha;
    }
}
