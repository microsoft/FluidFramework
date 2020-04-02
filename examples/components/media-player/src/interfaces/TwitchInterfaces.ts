/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ITwitchStream {
    id: string,
    login: string,
    description: string,
    profile_image_url: string,
    display_name: string
}

export interface ITwitchResponse {
    data: ITwitchStream[]
}