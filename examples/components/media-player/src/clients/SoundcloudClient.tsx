/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { GenericRestClient } from "simplerestclients";
import * as SyncTasks from "synctasks";

import * as SoundcloudInterfaces from "../interfaces/SoundcloudInterfaces";

const _clientId = "z21TN9SfM0GjGteSzk4ViM1KEwMRNWZF";
const _youtubeHost = "https://api.soundcloud.com/";

/** Fetch soundcloud song info via the soundcloud REST api. */
class SoundcloudClient extends GenericRestClient {
    constructor() {
        super(_youtubeHost);
        this._defaultOptions.contentType = "json";
    }

    // Can't use this because Soundcloud's dev support is terrible
    public getTrackById(id: string): SyncTasks.Promise<SoundcloudInterfaces.ISoundcloudTrack> {
        const url =
            `/tracks/${id}?client_id=${_clientId}`;
        return this.performApiGet<SoundcloudInterfaces.ISoundcloudTrack>(url)
            .catch((e) => {
                return SyncTasks.Rejected();
            });
    }


    public getSouncloudTrackId = (url: string) => {
        // eslint-disable-next-line max-len
        const regExp = /https?:\/\/(?:w\.|www\.|)soundcloud\.com\/(?:(?:player\/\?url=https%3A\/\/api.soundcloud.com\/tracks\/)|)((([\w-])[^A-z]{7})|([\dA-Za-z]+(?:[-_][\dA-Za-z]+)*(?!\/sets(?:\/|$))(?:\/[\dA-Za-z]+(?:[-_][\dA-Za-z]+)*){1,2}))/;
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        return (url.match(regExp)) ? RegExp.$1 : undefined;
    };
}

// eslint-disable-next-line import/no-default-export
export default new SoundcloudClient();
