/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { ChangeSet } = require('@fluid-experimental/property-changeset');
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
  .option('rootCommitGuid', {
    alias: 'c',
    description: 'Root commit guid',
    type: 'string'
  })
  .option('power', {
    alias: 'p',
    'default': 3,
    description: 'Order of magnitude of the amount of commits to import',
    type: 'number'
  })
  .option('folder', {
    alias: 'f',
    'default': 'commits',
    description: 'Path to a folder that contains the commits to ingest',
    type: 'string'
  })
  .demandOption(['branchGuid', 'rootCommitGuid']).argv;

  return Promise.resolve(argv);
};

const doWork = async (a) => {
  let resultChangeSet = new ChangeSet();

  let headers = Fixtures.getRequestSignatureHeaders(a.branchGuid);
  await Fixtures.createBranch(headers, {
    guid: a.branchGuid,
    rootCommitGuid: a.rootCommitGuid,
    meta: {},
    created: Date.now()
  });

  let commit, fetched;
  let parentCommitGuid = a.rootCommitGuid;
  let commitFilePath, fileExists;
  let i = 1;
  do {
    commitFilePath = path.join(a.folder, `${i.toString().padStart(a.power, '0')}.json`);
    fileExists = fs.existsSync(commitFilePath);
    if (fileExists) {
      commit = JSON.parse(fs.readFileSync(commitFilePath));
      resultChangeSet.applyChangeSet(commit.changeSet);
      headers = Fixtures.getRequestSignatureHeaders(a.branchGuid);
      await Fixtures.createCommit(a.branchGuid, headers, {
        guid: commit.guid,
        parentGuid: parentCommitGuid,
        branchGuid: a.branchGuid,
        changeSet: commit.changeSet,
        meta: {},
        created: Date.now()
      });

      fetched = await Fixtures.fetchMaterializedView(a.branchGuid, commit.guid, headers);
      expect(fetched.changeSet).to.eql(JSON.parse(resultChangeSet.toString()));

      parentCommitGuid = commit.guid;
      i++;
    }
  } while (fileExists);
};

processArgs().then((a) => doWork(a));
