import * as git from "@prague/gitresources";
import { IHistorian } from "@prague/services-client";

export class TestHistorian implements IHistorian {
    public endpoint = "http://test";

    public getHeader(sha: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public getBlob(sha: string): Promise<git.IBlob> {
        throw new Error("Method not implemented.");
    }

    public createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        throw new Error("Method not implemented.");
    }

    public getContent(path: string, ref: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        return [];
    }

    public getCommit(sha: string): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }

    public createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }

    public getRefs(): Promise<git.IRef[]> {
        throw new Error("Method not implemented.");
    }

    public getRef(ref: string): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        throw new Error("Method not implemented.");
    }

    public deleteRef(ref: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        throw new Error("Method not implemented.");
    }

    public getTag(tag: string): Promise<git.ITag> {
        throw new Error("Method not implemented.");
    }

    public createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        throw new Error("Method not implemented.");
    }

    public getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        throw new Error("Method not implemented.");
    }
}
