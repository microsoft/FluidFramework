import * as git from "gitresources";

export class TestHistorian implements git.IHistorian {
    private repos: Set<string> = new Set<string>();

    public getHeader(owner: string, repo: string, sha: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public getBlob(owner: string, repo: string, sha: string): Promise<git.IBlob> {
        throw new Error("Method not implemented.");
    }

    public createBlob(owner: string, repo: string, blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        throw new Error("Method not implemented.");
    }

    public getContent(owner: string, repo: string, path: string, ref: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async getCommits(owner: string, repo: string, sha: string, count: number): Promise<git.ICommitDetails[]> {
        return [];
    }

    public getCommit(owner: string, repo: string, sha: string): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }

    public createCommit(owner: string, repo: string, commit: git.ICreateCommitParams): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }

    public getRefs(owner: string, repo: string): Promise<git.IRef[]> {
        throw new Error("Method not implemented.");
    }

    public getRef(owner: string, repo: string, ref: string): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public createRef(owner: string, repo: string, params: git.ICreateRefParams): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public updateRef(owner: string, repo: string, ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public deleteRef(owner: string, repo: string, ref: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public async createRepo(owner: string, repo: git.ICreateRepoParams): Promise<any> {
        this.repos.add(repo.name);
    }

    public async getRepo(owner: string, repo: string): Promise<any> {
        return this.repos.has(repo) ? { name: repo } : null;
    }

    public createTag(owner: string, repo: string, tag: git.ICreateTagParams): Promise<git.ITag> {
        throw new Error("Method not implemented.");
    }

    public getTag(owner: string, repo: string, tag: string): Promise<git.ITag> {
        throw new Error("Method not implemented.");
    }

    public createTree(owner: string, repo: string, tree: git.ICreateTreeParams): Promise<git.ITree> {
        throw new Error("Method not implemented.");
    }

    public getTree(owner: string, repo: string, sha: string, recursive: boolean): Promise<git.ITree> {
        throw new Error("Method not implemented.");
    }
}
