/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const yargs = require('yargs');
const Fixtures = require('../../test/db/fixtures');

global.targets = {
  mhServerUrl: 'http://127.0.0.1:3070'
};

const processArgs = () => {
  const argv = yargs.option('branchGuid', {
    alias: 'b',
    description: 'Branch guid',
    type: 'string'
  })
  .demandOption(['branchGuid']).argv;

  return Promise.resolve(argv);
};


const doWork = async (a) => {
  const headers = Fixtures.getRequestSignatureHeaders(a.branchGuid);
  const branch = await Fixtures.fetchBranch(a.branchGuid, headers);
  console.log(JSON.stringify(branch, null, 2));
};

processArgs().then((a) => doWork(a));
