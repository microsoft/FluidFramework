import * as git from "./resources";

/**
 * Document header returned from the server
 */
export interface IHeader {
    // Tree representing all blobs in the snapshot
    tree: git.ITree;

    // Key blobs returned for performance. These include object headers and attribute files.
    blobs: git.IBlob[];
}

/**
 * Interface to a generic Git provider
 */
export interface IGitService {
    // Blobs
    getBlob(owner: string, repo: string, sha: string): Promise<git.IBlob>;
    createBlob(owner: string, repo: string, blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;

    // Content
    getContent(owner: string, repo: string, path: string, ref: string): Promise<any>;

    // Commits
    getCommits(owner: string, repo: string, sha: string, count: number): Promise<git.ICommitDetails[]>;
    getCommit(owner: string, repo: string, sha: string): Promise<git.ICommit>;
    createCommit(owner: string, repo: string, commit: git.ICreateCommitParams): Promise<git.ICommit>;

    // Refs
    getRefs(owner: string, repo: string): Promise<git.IRef[]>;
    getRef(owner: string, repo: string, ref: string): Promise<git.IRef>;
    createRef(owner: string, repo: string, params: git.ICreateRefParams): Promise<git.IRef>;
    updateRef(owner: string, repo: string, ref: string, params: git.IPatchRefParams): Promise<git.IRef>;
    deleteRef(owner: string, repo: string, ref: string): Promise<void>;

    // Repos
    createRepo(owner: string, repo: git.ICreateRepoParams): Promise<any>;
    getRepo(owner: string, repo: string): Promise<any>;

    // Tags
    createTag(owner: string, repo: string, tag: git.ICreateTagParams): Promise<git.ITag>;
    getTag(owner: string, repo: string, tag: string): Promise<git.ITag>;

    // Trees
    createTree(owner: string, repo: string, tree: git.ICreateTreeParams): Promise<git.ITree>;
    getTree(owner: string, repo: string, sha: string, recursive: boolean): Promise<git.ITree>;
}

/**
 * The Historian extends the git service by providing access to document header information stored in
 * the repository
 */
export interface IHistorian extends IGitService {
    /**
     * Retrieves the header for the given document
     */
    getHeader(owner: string, repo: string, sha: string): Promise<IHeader>;
}
