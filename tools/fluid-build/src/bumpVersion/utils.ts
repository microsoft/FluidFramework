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
export async function exec(cmd: string, dir: string, error?: string) {
    const result = await execWithErrorAsync(cmd, { cwd: dir }, "ERROR", false);
    if (error && result.error) {
        fatal(`ERROR: Unable to ${error}`);
    }
    return result.stdout;
}

export class GitUtil {
    private static _resolvedRoot: string | undefined;
    private static _originalBranchName: string | undefined;
    public static readonly newBranches: string[] = [];
    public static readonly newTags: string[] = [];

    public static async initialize(root: string) {
        this._resolvedRoot = root;
        this._originalBranchName = await this.getCurrentBranchName();
    }

    private static get resolvedRoot() {
        if (!this._resolvedRoot) { fatal("Internal error, resolved root not initialized"); }
        return this._resolvedRoot;
    }

    public static get originalBranchName() {
        if (!this._originalBranchName) { fatal("Internal error, original branch name not initialized") }
        return this._originalBranchName;
    }


    /**
     * Execute git command
     * 
     * @param command the git command
     * @param error description of command line to print when error happens
     */
    public static async exec(command: string, error?: string) {
        return exec(`git ${command}`, this.resolvedRoot, error);
    }

    /**
     * Execute git tag command
     * 
     * @param tag the tag to add
     */
    public static async tag(tag: string) {
        await this.exec(`tag ${tag}`, `adding tag ${tag}`);
        this.newTags.push(tag);
    }

    /**
     * Get the current git branch name
     */
    public static async getCurrentBranchName() {
        const revParseOut = await this.exec("rev-parse --abbrev-ref HEAD", "get current branch");
        return revParseOut.split("\n")[0];
    }


    public static async createBranch(branchName: string) {
        await GitUtil.exec(`checkout -b ${branchName}`, `create branch ${branchName}`);
        this.newBranches.push(branchName);
    }

    public static async cleanUp() {
        if (this.originalBranchName) {
            await this.exec(`checkout ${this.originalBranchName}`);

            for (const branch of this.newBranches) {
                await this.exec(`branch -D ${branch}`);
            }
            for (const tag of this.newTags) {
                await this.exec(`tag -d ${tag}`);
            }
        }
    }
}
