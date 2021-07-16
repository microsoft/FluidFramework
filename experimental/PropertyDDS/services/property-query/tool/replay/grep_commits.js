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
  .option('commitGuid', {
    alias: 'c',
    description: 'Last commit guid from where to start searching backwards',
    type: 'string'
  })
  .option('searchString', {
    alias: 's',
    description: 'String to find as part of the commit changeSet',
    type: 'string'
  })
  .demandOption(['branchGuid', 'commitGuid', 'searchString']).argv;

  return Promise.resolve(argv);
};

const doWork = async (a) => {
  let finished = false;
  let commitGuid = a.commitGuid;
  do {
    const headers = Fixtures.getRequestSignatureHeaders(a.branchGuid);
    const commitCS = await Fixtures.fetchSingleCommit(a.branchGuid, commitGuid, headers);
    const commit = await Fixtures.getCommit(a.branchGuid, commitGuid, headers);
    commit.commit.changeSet = commitCS.changeSet;
    const strCommitCS = JSON.stringify(commit.commit, null, 2);
    if (strCommitCS.includes(a.searchString)) {
      console.log(strCommitCS);
    }
    commitGuid = commit.commit.parentGuid;
    finished = commit.commit.sequence === 1 || !commitGuid;
  } while (!finished);
};

processArgs().then((a) => doWork(a));
