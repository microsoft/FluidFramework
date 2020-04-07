/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ISoundcloudTrack {
    id: string,
    description: string,
    title: string,
    uri: string,
    artwork_url: string,
    user: ISoundcloudUser
}

export interface ISoundcloudUser {
    id: string,
    permalink: string,
    username: string,
    uri: string,
    permalink_url: string,
    avatar_url: string
}
