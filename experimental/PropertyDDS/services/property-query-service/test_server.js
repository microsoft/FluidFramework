/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable */
let fs = require('fs');

let jsonOptions = (yargs) => {
  yargs.describe('files', 'JSON files to load')
    .default('files', ['branchInfo_multipleCommits2.json',  'branchInfo_references.json', 'branchInfo_index.json']);
};

let internalStringify = JSON.stringify;
JSON.stringify = function myStringify(obj) {
  return internalStringify(obj);
};
let internalParse = JSON.parse;
JSON.parse = function myParse(obj) {
  return internalParse(obj);
};

let syntheticOptions = (yargs) => {
  yargs.describe('sizePerCommit', 'Size of a commit [KB]');
  yargs.default('sizePerCommit', 1024);
  yargs.alias('c', 'sizePerCommit');

  yargs.describe('sizePerAsset', 'Size of an individual asset in a commit [KB]');
  yargs.default('sizePerAsset', 128);
  yargs.alias('a', 'sizePerAsset');

  yargs.describe('totalSize', 'Total size of the generated dataset [MB]');
  yargs.default('totalSize', 16);
  yargs.alias('t', 'totalSize');
  yargs.describe('useGuids', 'Store the assets under their GUIDs');
  yargs.boolean('useGuids');
  yargs.alias('g', 'useGuids');
};

let argv = require('yargs')
  .usage('Usage: $0 <command> [options]')
  .command(['json [files..]', '$0 [files..]'], 'Initialize the branches from json files', jsonOptions)
  .command('synthetic', 'Create a branch with synthetic test data', syntheticOptions)
  .command('all', 'Run all test sets', (yargs) => {
    jsonOptions(yargs);
    syntheticOptions(yargs);
  })
  .help('h')
  .alias('h', 'help')
  .argv;

let command = argv._[0] || 'json';

require('./server.js').then(async (materializedHistoryServer) => {
  let request = require('request');
  let _ = require('lodash');
  let generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;

  let postData = function(url, data) {
    return new Promise(function(resolve, reject) {
      request.post(url, {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }, (err, httpResponse, body) => {
        if (httpResponse.statusCode !== 200) {
          reject(new Error(body));
        } else {
          resolve(body);
        }
      });
    });
  };

  let createBranch = function({ branchGuid, rootCommitGuid, metaData }) {
    return postData(`http://localhost:${targets.port}/v1/branch`, {
      'guid': branchGuid,
      'rootCommitGuid': rootCommitGuid,
      'meta': metaData
    });
  };

  var addCommits = async function(in_branchGuid, in_parentGuid, in_nextCommitFunction, in_commitCounter) {
    in_commitCounter = in_commitCounter || 1;
    let commit = await in_nextCommitFunction(in_commitCounter);
    if (commit !== undefined) {

      commit.parentGuid = in_parentGuid;
      commit.branchGuid = in_branchGuid;

      await postData(
        `http://localhost:${targets.port}/v1/branch/${in_branchGuid}/commit`,
        commit
      );

      await addCommits(in_branchGuid, commit.guid, in_nextCommitFunction, in_commitCounter + 1);
    }
  };

  let createBranchWithCommits = function({ branchGuid, rootCommitGuid, metaData, commitFunction }) {
    return createBranch({ branchGuid, rootCommitGuid, metaData}).then(() => {
      return addCommits(branchGuid, rootCommitGuid, commitFunction);
    });
  };

  let padNumber = function(in_number, in_length) {
    in_number = String(in_number);
    while (in_number.length < in_length) {
      in_number = '0' + in_number;
    }
    return in_number;
  };
  // Test case to create a large branch
  let counterToHex = function(counter) {
    let string = counter.toString(16);


    return padNumber(string, 12);
  };

  // Test code that ingests commits from the supplied branch dump files
  if (command === 'json' || command === 'all') {
    // var files = ['branchInfo_multipleCommits.json', 'branchInfo_deletes.json', 'branchInfo_references.json', 'branchInfo_index.json'];
    let files = argv.files; // ['branchInfo_multipleCommits2.json',  'branchInfo_references.json', 'branchInfo_index.json'];
    let result = Promise.resolve();
    for (let i = 0; i < files.length; i++) {
      result = result.then( ((file) => {
        console.log('Loading ' + file);
        let data = JSON.parse(fs.readFileSync(file));

        return createBranchWithCommits({
          branchGuid: data.branch.guid,
          rootCommitGuid: data.branch.commits[0].guid,
          metaData: data.branch.meta,
          commitFunction: async (i) => {
            return data.branch.commits[i];
          }
        });
      }).bind(this, files[i]));
    }

    await result;
  }

  if (command === 'synthetic' || command === 'all') {
    let branchGUID = '95e23647-faf1-451f-9ab7-ceefca2e673d';
    let commitGUID_base = '5fc16fb7-6c2f-49bb-a9d0-';

    argv.sizePerAsset *= 1024;
    argv.sizePerCommit *= 1024;
    argv.totalSize *= 1024 * 1024;
    let numCommits = argv.totalSize / argv.sizePerCommit;

    let assetPayload = {
      String: {
      }
    };
    let payloadSize = 0;
    let keyCounter = 0;
    let dummyString = _.range(100).map(() => 'x').join('');
    let desiredPayLoadSize = argv.sizePerAsset - (argv.useGuids ? 154 : 130);
    while (payloadSize < desiredPayLoadSize) {
      var str;
      if (desiredPayLoadSize - payloadSize >= 100) {
        str = dummyString;
      } else {
        str =  _.range(desiredPayLoadSize - payloadSize - 16).map(() => 'x').join('');
      }
      assetPayload.String['data_' + padNumber(keyCounter, 5)] = str;
      payloadSize = JSON.stringify(assetPayload).length;
      keyCounter++;
    }
    console.log(desiredPayLoadSize, JSON.stringify(assetPayload).length);

    let globalAssetCounter = 0;
    let commitGUIDs = [];
    console.time('Processing commit 0');
    await createBranchWithCommits({
      branchGuid: branchGUID,
      rootCommitGuid: commitGUID_base + counterToHex(0),
      metaData: {},
      commitFunction: async (i) => {
        if (i <= numCommits) {
          console.timeEnd('Processing commit ' + (i - 1));
          console.time('Processing commit ' + i);
          let CS = {
            insert: {
              'adsk.example:asset-1.0.0': {
              }
            }
          };
          let assetsCS = CS.insert['adsk.example:asset-1.0.0'];

          insertedAssets = 0;
          while (insertedAssets < argv.sizePerCommit / argv.sizePerAsset) {
            let assetName = 'asset_' + padNumber(globalAssetCounter++, 5);
            let assetGuid = generateGUID();
            let assetID = argv.useGuids ? assetGuid : assetName;
            assetsCS[assetID] = {
              String: {
                name: assetName,
                guid: assetGuid
              },
              NodeProperty: {
                data: {
                  insert: assetPayload
                }
              }
            };
            insertedAssets++;
          }

          /* if (i > 1) {
            var leafs = await materializedHistoryServer._materializedHistoryService._getAllLeafsForCommit({ guid: commitGUIDs[commitGUIDs.length - 1] });

            console.log('Leafs in final commit: ' + leafs.length);
            var totalFinalSize = 0;
            leafs.forEach(x => {totalFinalSize += JSON.stringify(x.changeSet).length});
            console.log('Size of final commit CS: ' + Math.floor(totalFinalSize / 1024));
            console.log('Average leaf size: ' +  Math.floor(totalFinalSize / 1024 / leafs.length));
          }*/
          // console.log('Changed leafs: ' + global.modifiedLeafs);
          global.modifiedLeafs = 0;

          commitGUIDs.push(commitGUID_base + counterToHex(i));
          return {
            guid: commitGUID_base + counterToHex(i),
            meta: {},
            changeSet: JSON.stringify(CS)
          };
        } else {
          return undefined;
        }
      }
    }).then( async () =>  {
      console.log('All commits ingested');
      materializedHistoryServer._materializedHistoryService._storage._dumpStatistics();

      console.log('split: ' + global.splitNodes);
      console.log('merged: ' + global.mergedNodes);
      console.log('unsplit: ' + global.unsplitNodes);
      console.log('deltaEncoded: ' + global.deltaEncodedNodes);

      let leafs = await materializedHistoryServer._materializedHistoryService._getAllLeafsForCommit({ guid: commitGUIDs[commitGUIDs.length - 1] });

      console.log('Leafs in final commit: ' + leafs.length);
      let totalFinalSize = 0;
      leafs.forEach((x) => {totalFinalSize += JSON.stringify(x.changeSet).length;});
      console.log('Size of final commit CS: ' + Math.floor(totalFinalSize / 1024));
      console.log('Average leaf size: ' +  Math.floor(totalFinalSize / 1024 / leafs.length));

    });
  }
});
