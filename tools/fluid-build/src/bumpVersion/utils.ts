/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { execWithErrorAsync } from "../common/utils";

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
export async function exec(cmd: string, dir: string, error?: string, pipeStdIn?: string) {
    const result = await execWithErrorAsync(cmd, { cwd: dir }, "ERROR", false, pipeStdIn);
    if (error && result.error) {
        fatal(`ERROR: Unable to ${error}`);
    }
    return result.stdout;
}

export class GitRepo {
    private readonly remote: string;
    constructor(public readonly resolvedRoot: string) {
        // TODO: detect this
        this.remote = "origin";
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
        await this.exec(`tag -d ${tag}`);
    }

    /**
     * Push a tag
     * 
     */
    public async pushTag(tag: string) {
        await this.exec(`push ${this.remote} ${tag}`);
    }

    /**
     * Get the current git branch name
     */
    public async getCurrentBranchName() {
        const revParseOut = await this.exec("rev-parse --abbrev-ref HEAD", "get current branch");
        return revParseOut.split("\n")[0];
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
     * Delete a branch
     * NOTE: this doesn't fail on error
     * 
     * @param branchName name of the new branch
     */
    public async deleteBranch(branchName: string) {
        await this.exec(`branch -D ${branchName}`);
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
     * Execute git command
     * 
     * @param command the git command
     * @param error description of command line to print when error happens
     */
    private async exec(command: string, error?: string, pipeStdIn?: string) {
        return exec(`git ${command}`, this.resolvedRoot, error, pipeStdIn);
    }

}
