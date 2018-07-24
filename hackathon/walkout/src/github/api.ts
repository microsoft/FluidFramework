import * as request from "request-promise-native";

export class GitHub {
    constructor(private token) {
    }

    public async getRepos() {
        const options = {
            headers: {
                "Authorization": `token ${this.token}`,
                "User-Agent": "Request-Promise",
            },
            json: true,
            uri: "https://api.github.com/user/repos",
        };

        const repos = await request(options);
        return repos;
    }
}
