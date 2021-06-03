/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execAsync } from "../common/utils";
import * as path from "path";

export function fatal(error: string): never {
    const e = new Error(error);
    (e as any).fatal = true;
    throw e;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function exec(cmd: string, dir: string, error: string, pipeStdIn?: string) {
    const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
    if (result.error) {
        fatal(`ERROR: Unable to ${error}\nERROR: error during command ${cmd}\nERROR: ${result.error.message}`);
    }
    return result.stdout;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function execNoError(cmd: string, dir: string, pipeStdIn?: string) {
    const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
    if (result.error) {
        return undefined;
    }
    return result.stdout;
}

export class GitRepo {
    constructor(public readonly resolvedRoot: string) {
    }

    private async getRemotes() {
        const result = await this.exec(`remote -v`, `getting remotes`);
        const remoteLines = result.split(/\r?\n/);
        return remoteLines.map(line => line.split(/\s+/));
    }

    /**
     * Get the remote based on the partial Url.
     * It will match the first remote that contains the partialUrl case insensitively
     * @param partialUrl partial url to match case insensitively
     */
    public async getRemote(partialUrl: string) {
        const lowerPartialUrl = partialUrl.toLowerCase();
        const remotes = await this.getRemotes();
        for (const r of remotes) {
            if (r[1] && r[1].toLowerCase().includes(lowerPartialUrl)) {
                return r[0];
            }
        }
        return undefined;
    }

    public async getCurrentSha() {
        const result = await this.exec(`rev-parse HEAD`, `get current sha`);
        return result.split(/\r?\n/)[0];
    }

    public async getShaForBranch(branch: string, remote?: string) {
        const refspec = remote ? `refs/remotes/${remote}/${branch}` : `refs/heads/${branch}`;
        const result = await this.execNoError(`show-ref ${refspec}`);
        if (result) {
            const line = result.split(/\r?\n/)[0];
            if (line) {
                return line.split(" ")[0];
            }
        }
        return undefined;
    }

    public async isBranchUpToDate(branch: string, remote: string) {
        await this.fetchBranch(remote, branch);
        const currentSha = await this.getShaForBranch(branch);
        const remoteSha = await this.getShaForBranch(branch, remote);
        return (remoteSha === currentSha);
    }

    public async getStatus() {
        return await this.execNoError(`status --porcelain`);
    }

    public async getShaForTag(tag: string) {
        const result = await this.execNoError(`show-ref refs/tags/${tag}`);
        if (result) {
            const line = result.split(/\r?\n/)[0];
            if (line) {
                return line.split(" ")[0];
            }
        }
        return undefined;
    }

    /**
     * Add a tag to the current commit
     *
     * @param tag the tag to add
     */
    public async addTag(tag: string) {
        await this.exec(`tag ${tag}`, `adding tag ${tag}`);
    }

    /**
     * Delete a tag
     * NOTE: this doesn't fail on error
     *
     * @param tag the tag to add
     */
    public async deleteTag(tag: string) {
        await this.execNoError(`tag -d ${tag}`);
    }

    /**
     * Push a tag
     *
     */
    public async pushTag(tag: string, remote: string) {
        await this.exec(`push ${remote} ${tag}`, `pushing tag`);
    }

    /**
     * Get the current git branch name
     */
    public async getCurrentBranchName() {
        const revParseOut = await this.exec("rev-parse --abbrev-ref HEAD", "get current branch");
        return revParseOut.split(/\r?\n/)[0];
    }

    /**
     * Create a new branch
     *
     * @param branchName name of the new branch
     */
    public async createBranch(branchName: string) {
        await this.exec(`checkout -b ${branchName}`, `create branch ${branchName}`);
    }

    /**
     * Push branch
     * @param branchName
     */
    public async pushBranch(remote: string, fromBranchName: string, toBranchName: string) {
        await this.exec(`push ${remote} ${fromBranchName}:${toBranchName}`, `push branch ${fromBranchName}->${toBranchName} to ${remote}`);
    }

    /**
     * Delete a branch
     * NOTE: this doesn't fail on error
     *
     * @param branchName name of the new branch
     */
    public async deleteBranch(branchName: string) {
        await this.execNoError(`branch -D ${branchName}`);
    }

    /**
     * Switch branch
     *
     * @param branchName name of the new branch
     */
    public async switchBranch(branchName: string) {
        await this.exec(`checkout ${branchName}`, `switch branch ${branchName}`);
    }

    /**
     * Commit changes
     *
     * @param message the commit message
     */
    public async commit(message: string, error: string) {
        await this.exec(`commit -a -F -`, error, message);
    }

    /**
     * Fetch branch
     */
    public async fetchBranch(remote: string, branchName: string) {
        return await this.exec(`fetch ${remote} ${branchName}`, `fetch branch ${branchName} from remote ${remote}`);
    }

    /**
     * Fetch Tags
     */
    public async fetchTags() {
        return await this.exec(`fetch --tags`, `fetch tags`);
    }

    /**
     * Get Tags
     *
     * @param pattern pattern of tags to get
     */
    public async getTags(pattern: string) {
        return await this.exec(`tag -l ${pattern}`, `get tags ${pattern}`);
    }

    /**
     * Execute git command
     *
     * @param command the git command
     * @param error description of command line to print when error happens
     */
    private async exec(command: string, error: string, pipeStdIn?: string) {
        return exec(`git ${command}`, this.resolvedRoot, error, pipeStdIn);
    }

    /**
     * Execute git command
     *
     * @param command the git command
     * @param error description of command line to print when error happens
     */
    private async execNoError(command: string, pipeStdIn?: string) {
        return execNoError(`git ${command}`, this.resolvedRoot, pipeStdIn);
    }
}

/**
 * Runs policy check in fix/resolution mode the apply any an necessary changes
 * Currently this should only apply assert short codes, but could apply
 * additional policies in the future
 * @param gitRepo - the git repo context to run policy check on
 */
export async function runPolicyCheckWithFix(gitRepo: GitRepo){
    console.log("Running Policy Check with Resolution(fix)");
    await exec(
        `node ${path.join(__dirname, '..', 'repoPolicyCheck', 'repoPolicyCheck.js')} -r -q`,
        gitRepo.resolvedRoot,
        "policy-check:fix failed");

    // check for policy check violation
    const afterPolicyCheckStatus = await gitRepo.getStatus();
    if (afterPolicyCheckStatus !== "") {
        console.log("======================================================================================================");
        fatal(`Policy check needed to make modifications. Please create PR for the changes and merge before retrying.\n${afterPolicyCheckStatus}`);
    }
}
