/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
var path = require('path'),
    Settings = require('./settings');


// We hardcode the settings for this project. We might want to move this, if we ever need the settings class
// for multiple projects
const settingsFiles = [
  path.join(__dirname, '..', '..', '..', 'config', 'settings.json')
];

const settings = new Settings(settingsFiles);

module.exports = settings;
