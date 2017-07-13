import * as git from "nodegit";
import * as path from "path";

export function openRepo(baseDir: string, name: string): Promise<git.Repository> {
    const parsed = path.parse(name);
    if (parsed.dir !== "") {
        return Promise.reject("Invalid repo name");
    }

    return git.Repository.open(`${baseDir}/${parsed.base}`);
}
