/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const settingsJSON = require('./test_settings.json');
const MinimalSettings = require('../src/utils/minimal_settings');

module.exports =  new MinimalSettings(settingsJSON);
