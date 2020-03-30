/**
 * YoutubeClient.ts
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as _ from 'lodash';
import { GenericRestClient } from 'simplerestclients';
import * as SyncTasks from 'synctasks';

import * as YoutubeInterfaces from '../interfaces/YoutubeInterfaces';

const _key = 'AIzaSyABfuNGolbbkvzZaDouC-0Esd4fgg-AcvI';
const _youtubeHost = 'https://www.googleapis.com/';

/** Fetch youtube info via the youtube REST api. */
class YoutubeClient extends GenericRestClient {
    constructor() {
        super(_youtubeHost);
        this._defaultOptions.contentType = 'json';
    }

    public getVideoById(id: string): SyncTasks.Promise<YoutubeInterfaces.IVideo> {
        return this.getVideosById([id])
            .then(videoListResponse => videoListResponse && !_.isEmpty(videoListResponse.items) ?
                videoListResponse.items[0] : SyncTasks.Rejected());
    }

    /** Get a YoutubeInterfaces.VideoListResponse for a set of ids. Use safe search. */
    public getVideosById(ids: string[]): SyncTasks.Promise<YoutubeInterfaces.IVideoListResponse> {
        if (_.isEmpty(ids)) {
            return SyncTasks.Rejected();
        }

        const url =
        `youtube/v3/videos?key=${_key}&id=${_.join(ids, ',')}&safeSearch=strict&part=contentDetails,status,id,player,snippet,statistics`;
        return this.performApiGet<YoutubeInterfaces.IVideoListResponse>(url)
            .catch(e => {
                return SyncTasks.Rejected();
            });
    }

    public getYoutubeVideoId = (url: string) => {
        var regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        var match = url.match(regExp);
        if (match && match[2].length == 11) {
          return match[2];
        } else {
          return undefined;
        }
    }
}

export default new YoutubeClient();
