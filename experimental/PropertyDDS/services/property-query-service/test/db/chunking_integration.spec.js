/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
const { generateGUID } = require('@fluid-experimental/property-common').GuidUtils;
const { ChangeSet } = require('@fluid-experimental/property-changeset');
const createMhs = require('../utils/create_mhs');
const _ = require('lodash');

describe('Chunking integration test', () => {
  let mhService;
  before(() => {
    ({ mhService } = createMhs({
      'mh:chunkSize': 16
    }));
    return mhService.init();
  });

  after(() => mhService.stop());

  describe('when inserting properties causing a split', () => {
    let branchGuid, firstCS, secondCS, firstCommitGuid, secondCommitGuid;
    before(async () => {
      branchGuid = generateGUID();
      const rootCommitGuid = generateGUID();
      firstCS = {
        insert: {
          NodeProperty: {
            a: {
              insert: {
                String: {
                  a: 'Hello'
                }
              }
            },
            b: {
              insert: {
                String: {
                  b: 'World'
                }
              }
            }
          }
        }
      };
      await mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta: {}
      });
      firstCommitGuid = generateGUID();
      await mhService.createCommit({
        guid: firstCommitGuid,
        meta: {},
        branchGuid,
        parentGuid: rootCommitGuid,
        changeSet: firstCS
      });

      secondCS = {
        modify: {
          NodeProperty: {
            b: {
              insert: {
                String: {
                  a: 'beautiful'
                }
              }
            }
          }
        }
      };
      secondCommitGuid = generateGUID();
      await mhService.createCommit({
        guid: secondCommitGuid,
        meta: {},
        branchGuid,
        parentGuid: firstCommitGuid,
        changeSet: _.cloneDeep(secondCS)
      });
    });

    it('should keep a normalized MV', async () => {
      const resultChangeSet = new ChangeSet();
      resultChangeSet.applyChangeSet(firstCS);
      resultChangeSet.applyChangeSet(secondCS);
      const fetched = await mhService.getCommitMV({
        guid: secondCommitGuid,
        branchGuid
      });
      expect(fetched.changeSet).to.eql(JSON.parse(resultChangeSet.toString()));
    });

    it('should return the correct result for a partial checkout', async () => {
      const fetched = await mhService.getCommitMV({
        guid: firstCommitGuid,
        branchGuid,
        paths: ['b.a']
      });
      expect(fetched.changeSet).to.eql({
        insert: {
          NodeProperty: {
            b: {}
          }
        }
      });
    });
  });
});
