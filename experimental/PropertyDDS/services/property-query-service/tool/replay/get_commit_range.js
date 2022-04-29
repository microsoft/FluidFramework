/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const yargs = require('yargs');
const RequestUtils = require('hfdm-utils').Utils.RequestUtils;
const { promisify } = require('util');
const requestAsPromise = promisify(RequestUtils.requestWithRetries);
const fs = require('fs');
const path = require('path');

const processArgs = () => {
  const argv = yargs.option('branchGuid', {
    alias: 'b',
    description: 'Branch guid',
    type: 'string'
  })
  .option('power', {
    alias: 'p',
    'default': 3,
    description: 'Order of magnitude of the amount of commits in the branch',
    type: 'string'
  })
  .option('folder', {
    alias: 'f',
    'default': 'commits',
    description: 'Path to a folder that will contain the obtained commits',
    type: 'string'
  })
  .option('token', {
    alias: 't',
    description: 'Authentication token (if needed)',
    type: 'string'
  })
  .option('serverUrl', {
    alias: 's',
    'default': 'http://127.0.0.1:3025',
    description: 'REST API server URL',
    type: 'string'
  })
  .demandOption(['branchGuid']).argv;

  return Promise.resolve(argv);
};

const doWork = async (a) => {
  if (!fs.existsSync(a.folder)) {
    fs.mkdirSync(a.folder);
  }

  const COMMITS_PER_BATCH = 100;
  let minCommitId, numberOfCommits, filePath;
  do {
    const result = await requestAsPromise({
      requestParams: {
        url: `${a.serverUrl}/oapi/v3/branches/${a.branchGuid}/commits/range`,
        headers: {
          Authorization: a.token ? 'Bearer ' + a.token : ''
        },
        method: 'GET',
        json: true,
        qs: {
          limit: COMMITS_PER_BATCH,
          minCommitId
        }
      },
      retries: 1
    });

    numberOfCommits = result.commits.length;
    if (numberOfCommits === 0) {
      break;
    }

    for (const commit of result.commits) {
      filePath = path.join(a.folder, commit.sequence.toString().padStart(a.power, '0') + '.json');
      fs.writeFileSync(filePath, JSON.stringify(commit));
      minCommitId = commit.guid;
    }
  } while (!(numberOfCommits < COMMITS_PER_BATCH));
};

processArgs().then((a) => doWork(a));
