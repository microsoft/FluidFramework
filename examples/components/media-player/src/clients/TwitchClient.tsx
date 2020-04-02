/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as _ from 'lodash';
import * as SyncTasks from 'synctasks';
import { GenericRestClient } from 'simplerestclients';
import { ITwitchStream } from '../interfaces/TwitchInterfaces';
import { ITwitchResponse } from '../interfaces/TwitchInterfaces';

const _clientId = 'ilna1bcp30lm4l5oou3oer5hpe29ca';
const _twitchHost = 'https://api.twitch.tv/helix';

/** Fetch twitch stream info via the twitch REST api. */
class TwitchClient extends GenericRestClient {
    constructor() {
        super(_twitchHost);
        this._defaultOptions.contentType = 'json';
        this._defaultOptions.headers = {"Client-ID": _clientId};
    }

    public getStreamById(id: string): SyncTasks.Promise<ITwitchStream> {
        const url =
            `/users?login=${id}`;
        return this.performApiGet<ITwitchResponse>(url).then(response => {
            if (response.data.length > 0) {
                return response.data[0];
            } else {
                throw Error;
            }
        })
            .catch(e => {
                return SyncTasks.Rejected();
            });
    }

    public getTwitchStreamId = (url: string) => {
        var pieces = url.split("twitch.tv/");
        if (pieces.length > 0) {
            return pieces[pieces.length - 1];
        }
    }
}

export default new TwitchClient();
