/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as request from "request-promise-native";

export interface IUser {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
    name: string;
    company: string;
    blog: string;
    location: string;
    email: string;
    hireable: boolean;
    bio: string;
    public_repos: number;
    public_gists: number;
    followers: number;
    following: number;
    created_at: string;
    updated_at: string;
}

export interface IPassportUser {
    id: string;
    displayName: string;
    username: string;
    profileUrl: string;
    emails: Array<{ value: string }>;
    photos: Array<{ value: string }>;
    provider: string;
    _json: IUser;
}

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
