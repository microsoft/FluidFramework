import * as fs from "fs";
import * as git from "nodegit";
import * as path from "path";
import * as util from "util";

const exists = util.promisify(fs.exists);

// 100644 for file (blob)
// 100755 for executable (blob)
// 040000 for subdirectory (tree)
// 160000 for submodule (commit)
// 120000 for a blob that specifies the path of a symlink

/** Basic type (loose or packed) of any Git object. */
export enum GitObjectType {
    any = -2,       /** < Object can be any of the following */
    bad = -1,       /** < Object is invalid. */
    ext1 = 0,       /** < Reserved for future use. */
    commit = 1,     /** < A commit object. */
    tree = 2,       /** < A tree (directory listing) object. */
    blob = 3,       /** < A file revision object. */
    tag = 4,        /** < An annotated tag object. */
    ext2 = 5,       /** < Reserved for future use. */
    ofsdelta = 6,   /** < A delta, base is given by an offset. */
    refdelta = 7,   /** < A delta, base is given by object id. */
}

export class RepositoryManager {
    // Cache repositories to allow for reuse
    private repositoryCache: { [key: string]: Promise<git.Repository> } = {};

    constructor(private baseDir) {
    }

    public async create(name: string): Promise<git.Repository> {
        const parsed = path.parse(name);
        if (parsed.dir !== "") {
            return Promise.reject("Invalid repo name");
        }

        // Create and then cache the repository
        const isBare: any = 1;
        const repository = await git.Repository.init(`${this.baseDir}/${parsed.base}`, isBare);
        this.repositoryCache[parsed.base] = Promise.resolve(repository);
    }

    public async open(name: string): Promise<git.Repository> {
        const parsed = path.parse(name);
        if (parsed.dir !== "") {
            return Promise.reject("Invalid repo name");
        }

        if (!(parsed.base in this.repositoryCache)) {
            const directory = `${this.baseDir}/${parsed.base}`;

            if (!await exists(directory)) {
                return Promise.reject("Repo does not exist");
            }

            this.repositoryCache[parsed.base] = git.Repository.open(directory);
        }

        return this.repositoryCache[parsed.base];
    }
}
