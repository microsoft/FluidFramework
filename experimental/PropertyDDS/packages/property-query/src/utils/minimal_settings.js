/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */


class MinimalSettings {
    constructor(settings) {
        this._settings = settings
    }

    get(key) {
        /*const parts = key.split(':');
        for (let i = 1; i <= parts.length; i++) {
            const entry = this._settings[parts.slice(0,i).join(':')];
            if (entry !== undefined) {
                const setting = entry['default'];
                return setting;
            }
        }*/
        return this._settings[key]['default'];
    }

    set(key, value) {
        this._settings[key] = this._settings[key] || {};
        this._settings[key]['default'] = value;
    }

}

module.exports = MinimalSettings;
