import * as git from "nodegit";

// Opening - http://www.nodegit.org/guides/repositories/
// git.Repository.open()
// Initializing - http://www.nodegit.org/guides/repositories/initializing/

export function getRepository(location: string): Promise<git.Repository> {
    const repoP = git.Repository.open(location).catch(
        (error) => {
            if (error.errno === -3) {
                const isBare: any = 1;
                return git.Repository.init(location, isBare);
            } else {
                return Promise.reject(error);
            }
        });

    return repoP;
}
