/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as _ from 'lodash';
import { GenericRestClient } from 'simplerestclients';
import * as SyncTasks from 'synctasks';

import * as SoundcloudInterfaces from '../interfaces/SoundcloudInterfaces';

const _clientId = 'z21TN9SfM0GjGteSzk4ViM1KEwMRNWZF';
const _youtubeHost = 'https://api.soundcloud.com/';

/** Fetch youtube info via the youtube REST api. */
class SoundcloudClient extends GenericRestClient {
    constructor() {
        super(_youtubeHost);
        this._defaultOptions.contentType = 'json';
    }

    // Can't use this because Soundcloud's dev support is terrible
    public getTrackById(id: string): SyncTasks.Promise<SoundcloudInterfaces.ISoundcloudTrack> {
        const url =
            `/tracks/${id}?client_id=${_clientId}`;
        return this.performApiGet<SoundcloudInterfaces.ISoundcloudTrack>(url)
            .catch(e => {
                return SyncTasks.Rejected();
            });
    }

    
    public getSouncloudTrackId = (url: string) => {
        var regExp = /https?:\/\/(?:w\.|www\.|)(?:soundcloud\.com\/)(?:(?:player\/\?url=https\%3A\/\/api.soundcloud.com\/tracks\/)|)(((\w|-)[^A-z]{7})|([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*(?!\/sets(?:\/|$))(?:\/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*){1,2}))/;
        return (url.match(regExp)) ? RegExp.$1 : null;
    }
}

export default new SoundcloudClient();
