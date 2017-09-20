import * as git from "gitresources";

export class TestHistorian implements git.IHistorian {
    private repos: Set<string> = new Set<string>();

    public getHeader(repo: string, sha: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public getBlob(repo: string, sha: string): Promise<git.IBlob> {
        throw new Error("Method not implemented.");
    }

    public createBlob(repo: string, blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        throw new Error("Method not implemented.");
    }

    public getContent(repo: string, path: string, ref: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async getCommits(repo: string, sha: string, count: number): Promise<git.ICommit[]> {
        return [];
    }

    public getCommit(repo: string, sha: string): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }

    public createCommit(repo: string, commit: git.ICreateCommitParams): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }

    public getRefs(repo: string): Promise<git.IRef[]> {
        throw new Error("Method not implemented.");
    }

    public getRef(repo: string, ref: string): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public createRef(repo: string, params: git.ICreateRefParams): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public updateRef(repo: string, ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public deleteRef(repo: string, ref: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public async createRepo(repo: git.ICreateRepoParams): Promise<any> {
        this.repos.add(repo.name);
    }

    public async getRepo(repo: string): Promise<any> {
        return this.repos.has(repo) ? { name: repo } : null;
    }

    public createTag(repo: string, tag: git.ICreateTagParams): Promise<git.ITag> {
        throw new Error("Method not implemented.");
    }

    public getTag(repo: string, tag: string): Promise<git.ITag> {
        throw new Error("Method not implemented.");
    }

    public createTree(repo: string, tree: git.ICreateTreeParams): Promise<git.ITree> {
        throw new Error("Method not implemented.");
    }

    public getTree(repo: string, sha: string, recursive: boolean): Promise<git.ITree> {
        throw new Error("Method not implemented.");
    }
}
