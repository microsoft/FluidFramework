import * as simpleGit from "simple-git/promise";
import { mkdirp, pathExists, writeFile } from "../utils";

/**
 * File stored in a git repo
 */
export interface IGitFile {
    // Path to the file
    path: string;

    // Data for the file
    data: any;
}

export class GitManager {
    private static async getClient(branch: string, repository: string, basePath: string): Promise<simpleGit.SimpleGit> {
        const repositoryPath = `${basePath}/${branch}`;

        const exists = await pathExists(repositoryPath);
        if (!exists) {
            await mkdirp(basePath);
            const gitClient = simpleGit(basePath);
            await gitClient.clone(repository, branch, ["--no-checkout"]);
        }

        const client = simpleGit(repositoryPath);
        const remotes: string[] = await (<any> client).listRemote();

        if (remotes.indexOf(branch) !== -1) {
            await client.checkout(branch);
        } else {
            await client.checkout(["--orphan", branch]);
        }

        await Promise.all([
            (<any> client).addConfig("user.name", "Kurt Berglund"),
            (<any> client).addConfig("user.email", "kurtb@microsoft.com")]);

        return client;
    }

    private lastOperationP: Promise<any> = Promise.resolve();
    private clientP: Promise<simpleGit.SimpleGit>;

    constructor(private branch: string, repository: string, private basePath: string) {
        this.clientP = GitManager.getClient(branch, repository, basePath);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getCommits(branch: string, sha: string, count: string): Promise<any> {
        return this.sequence(() => this.getCommitsInternal(branch, sha, count));
    }

    /**
     * Retrieves the object at the given revision number
     */
    public async getObject(sha: string, path: string): Promise<any> {
        return this.sequence(() => this.getObjectInternal(sha, path));
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(branch: string, files: IGitFile[], message: string): Promise<void> {
        return this.sequence(() => this.writeInternal(branch, files, message));
    }

    /**
     * Helper method to sequence the simple-git operations. Due to https://github.com/steveukx/git-js/issues/136
     * an error in one simple-git operation, if not sequenced, can cause another one to never resolve.
     */
    private async sequence<T>(fn: () => Promise<T>): Promise<T> {
        this.lastOperationP = this.lastOperationP.catch(() => Promise.resolve()).then(() => fn());
        return this.lastOperationP;
    }

    private async getCommitsInternal(branch: string, sha: string, count: string): Promise<any> {
        const client = await this.clientP;

        // Use this as an opportunity to update the repo
        await client.fetch("origin");

        const from = sha || `refs/remotes/origin/${branch}`;
        const commits = await (<any> client).log([from, "-n", count]);

        return commits.all;
    }

    private async getObjectInternal(sha: string, path: string): Promise<any> {
        const client = await this.clientP;
        return (<any> client).show([`${sha}:${path}`]);
    }

    /**
     * Writes to the object with the given ID
     */
    private async writeInternal(branch: string, files: IGitFile[], message: string): Promise<any> {
        if (branch !== this.branch) {
            throw new Error("Can only write to checked out branch");
        }

        const client = await this.clientP;

        for (const file of files) {
            await writeFile(`${this.basePath}/${branch}/${file.path}`, file.data);
        }

        await (<any> client).add(".");
        await (<any> client).commit(message);
        return (<any> client).push(["--set-upstream", "origin", branch]);
    }
}
