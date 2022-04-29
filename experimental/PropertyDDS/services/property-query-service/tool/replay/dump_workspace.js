/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals targets */
const yargs = require('yargs');
const { HFDM } = require('@hfdm/sdk');

global.targets = {
  csServerUrl_v1: 'http://127.0.0.1:3010',
  psServerUrl_v1: 'http://127.0.0.1:3000'
};

const processArgs = () => {
  const argv = yargs.option('token', {
    alias: 't',
    description: 'Authentication token (if needed)',
    type: 'string'
  })
  .option('apiUrl', {
    alias: 'a',
    description: 'API URL (if omitted, a local stack is assumed)',
    type: 'string'
  })
  .option('branchUrn', {
    alias: 'b',
    description: 'Branch URN',
    type: 'string'
  })
  .demandOption(['branchUrn']).argv;

  return Promise.resolve(argv);
};

const doWork = async (a) => {
  const hfdm = new HFDM();
  let connectOptions;
  if (a.apiUrl) {
    connectOptions = {
      serverUrl: a.apiUrl,
      getBearerToken: (cb) => cb(null, a.token)
    };
  } else {
    connectOptions = {
      serverUrl: targets.csServerUrl_v1,
      _pssUrl: targets.psServerUrl_v1
    };
  }
  await hfdm.connect(connectOptions);

  const workspace = hfdm.createWorkspace();
  await workspace.initialize({
    urn: a.branchUrn
  });
  workspace.prettyPrint();
  console.log(workspace.getActiveCommit().getGuid());
};

processArgs().then((a) => doWork(a));
