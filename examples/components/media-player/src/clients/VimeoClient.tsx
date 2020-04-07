/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as SyncTasks from "synctasks";
import { GenericRestClient } from "simplerestclients";
import { IVimeoVideo } from "../interfaces/VimeoInterfaces";

const _accessToken = "c39da186d5e65704880194947c088136";
const _vimeoHost = "https://api.vimeo.com/";

/** Fetch vimeo video info via the vimeo REST api. */
class VimeoClient extends GenericRestClient {
    constructor() {
        super(_vimeoHost);
        this._defaultOptions.contentType = "json";
        this._defaultOptions.headers = {Authorization: `Bearer ${_accessToken}`};
    }

    public getVideoById(id: string): SyncTasks.Promise<IVimeoVideo> {
        const url =
            `/videos/${id}`;
        return this.performApiGet<IVimeoVideo>(url)
            .catch((e) => {
                return SyncTasks.Rejected();
            });
    }

    public getVimeoTrackId = (url: string) => {
        // eslint-disable-next-line max-len
        const regExp = /https?:\/\/(?:vimeo\.com\/|player\.vimeo\.com\/)(?:video\/|(?:channels\/staffpicks\/|channels\/)|)((\w|-){7,9})/;
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        return (url.match(regExp)) ? RegExp.$1 : undefined;
    };
}

// eslint-disable-next-line import/no-default-export
export default new VimeoClient();
