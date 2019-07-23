
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script is used by the build server to compute the version number of the packages
 * The input is VERSION_BUILDNUMBER in the environment and the value of it is added to 
 * the version indicated in lerna.json.  The script simply output the result in the console.
 */
const lerna_version = require('../../lerna.json').version;
const env_build_num = process.env["VERSION_BUILDNUMBER"];
const build_num = parseInt(env_build_num.split('.')[0]);
const v = lerna_version.split('.'); 
v[v.length - 1] = parseInt(v[v.length - 1]) + parseInt(build_num); 
const version = v.join('.'); 

console.log(version);

