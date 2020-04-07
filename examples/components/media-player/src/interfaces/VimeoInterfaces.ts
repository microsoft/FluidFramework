/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IVimeoVideo {
    id: string,
    description: string,
    name: string,
    link: string,
    user: IVimeoUser,
    pictures: {
        uri: string,
        sizes: IVimeoPicture[]
    }
}

export interface IVimeoUser {
    id: string,
    name: string,
    uri: string
}

export interface IVimeoPicture {
    width: string;
    height: string;
    link: string;
    link_with_play_button: string;
}
