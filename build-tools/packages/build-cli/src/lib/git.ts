/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SimpleGit, SimpleGitOptions, simpleGit } from "simple-git";
// flase positive?
// eslint-disable-next-line node/no-missing-import
import type { SetRequired } from "type-fest";

import { CommandLogger } from "../logging";

/**
 * Default options passed to the git client.
 */
const defaultGitOptions: Partial<SimpleGitOptions> = {
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
 * while this class uses a library wrapper around git where possible instead. Note that git is still called "directly" via the `raw` API.
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
        gitOptions: SetRequired<Partial<SimpleGitOptions>, "baseDir">,
        protected readonly log?: CommandLogger,
    ) {
        const options: SetRequired<Partial<SimpleGitOptions>, "baseDir"> = {
            ...gitOptions,
            ...defaultGitOptions,
        };
        log?.verbose("gitOptions:");
        log?.verbose(JSON.stringify(options));
        this.git = simpleGit(options);
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
}
