import * as git from "./resources";

/**
 * Interface to a generic Git provider
 */
export interface IGitService {
    // Blobs
    getBlob(repo: string, sha: string): Promise<git.IBlob>;
    createBlob(repo: string, blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;

    // Content
    getContent(repo: string, path: string, ref: string): Promise<any>;

    // Commits
    getCommits(repo: string, sha: string, count: number): Promise<git.ICommit[]>;
    getCommit(repo: string, sha: string): Promise<git.ICommit>;
    createCommit(repo: string, commit: git.ICreateCommitParams): Promise<git.ICommit>;

    // Refs
    getRefs(repo: string): Promise<git.IRef[]>;
    getRef(repo: string, ref: string): Promise<git.IRef>;
    createRef(repo: string, params: git.ICreateRefParams): Promise<git.IRef>;
    updateRef(repo: string, ref: string, params: git.IPatchRefParams): Promise<git.IRef>;
    deleteRef(repo: string, ref: string): Promise<void>;

    // Repos
    createRepo(repo: git.ICreateRepoParams): Promise<any>;
    getRepo(repo: string): Promise<any>;

    // Tags
    createTag(repo: string, tag: git.ICreateTagParams): Promise<git.ITag>;
    getTag(repo: string, tag: string): Promise<git.ITag>;

    // Trees
    createTree(repo: string, tree: git.ICreateTreeParams): Promise<git.ITree>;
    getTree(repo: string, sha: string, recursive: boolean): Promise<git.ITree>;
}

/**
 * The Historian extends the git service by providing access to document header information stored in
 * the repository
 */
export interface IHistorian extends IGitService {
    /**
     * Retrieves the header for the given document
     */
    getHeader(repo: string, sha: string): Promise<any>;
}
