import * as simpleGit from "simple-git/promise";
import { mkdirp, pathExists, writeFile } from "../utils";
import { debug } from "./debug";

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
        debug("Remotes", remotes);

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

    private clientP: Promise<simpleGit.SimpleGit>;

    constructor(private branch: string, repository: string, private basePath: string) {
        this.clientP = GitManager.getClient(branch, repository, basePath);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getCommits(branch: string, sha: string, count: string): Promise<any> {
        const client = await this.clientP;

        // Use this as an opportunity to update the repo
        await client.fetch("origin");

        // And then go and grab the revision range
        const from = sha || `refs/remotes/origin/${branch}`;
        console.log(from);
        const commits = await (<any> client).log([from, "-n", count]);

        return commits.all;
    }

    /**
     * Retrieves the object at the given revision number
     */
    public async getObject(sha: string, path: string): Promise<any> {
        const client = await this.clientP;
        return await (<any> client).show([`${sha}:${path}`]);
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(branch: string, data: any, path: string, message: string): Promise<void> {
        if (branch !== this.branch) {
            throw new Error("Can only write to checked out branch");
        }

        const client = await this.clientP;
        await writeFile(`${this.basePath}/${branch}/${path}`, data);

        await (<any> client).add(".");
        await (<any> client).commit(message);
        await (<any> client).push(["--set-upstream", "origin", branch]);

        const status = await client.status();
        debug("Status", status);
    }
}
