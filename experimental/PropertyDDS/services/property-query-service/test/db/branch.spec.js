/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* globals targets */
const Fixtures = require('./fixtures');
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const MHServer = require('../../src/server/server');
const getPort = require('get-port');
const PluginManager = require('../../src/plugins/PluginManager');
const getExpressApp = require('../utils/get_express_app');

describe('Branch creation integration test', function() {
  this.timeout(20000);

  let createdBranchGuid = generateGUID();
  let rootCommitGuid = generateGUID();
  let server;

  before(async () => {
    const port = await getPort();

    targets.mhServerUrl = `http://127.0.0.1:${port}`;
    server = new MHServer({
      app: getExpressApp(),
      port,
      systemMonitor: PluginManager.instance.systemMonitor
    });
    await server.start();
  });

  after(() => server.stop());

  it('should be possible to create a branch', async () => {
    let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);

    await Fixtures.createBranch(headers, {
      guid: createdBranchGuid,
      rootCommitGuid: rootCommitGuid,
      meta: {},
      created: Date.now()
    });
  });

  it('should be possible to fetch that branch', async () => {
    let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
    let result = await Fixtures.fetchBranch(createdBranchGuid, headers);

    expect(result).to.exist;
    expect(result.guid).to.eql(createdBranchGuid);
    expect(result.headSequenceNumber).to.eql(0);
    expect(result.created).to.exist;
    expect(result.rootCommitGuid).to.eql(rootCommitGuid);
    expect(result.headCommitGuid).to.eql(rootCommitGuid);
    expect(new Date(result.created).getTime()).to.be.closeTo(new Date().getTime(), 1000);
  });

  it('should fail to fetch that branch with an invalid request signature', () => {
    return expect(Fixtures.fetchBranch(createdBranchGuid, {}))
      .to.rejectedWith(Error, 'Request signature algorithm not supported');
  });

  it('should fail to create a branch if the body is invalid (missing rootCommitGuid)', async () => {
    let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
    return expect(Fixtures.createBranch(headers, {
      guid: createdBranchGuid,
      meta: {},
      created: Date.now()
    })).to.rejectedWith(Error, 'Missing body element: \'rootCommitGuid\'');
  });

  it('should fail to create a branch if the body is invalid (missing meta)', async () => {
    let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
    return expect(Fixtures.createBranch(headers, {
      guid: createdBranchGuid,
      rootCommitGuid: rootCommitGuid,
      created: Date.now()
    })).to.rejectedWith(Error, 'Missing body element: \'meta\'');
  });

  it('should fail to create a branch with invalid request signature', () => {
    return expect(Fixtures.createBranch({}, {
      guid: createdBranchGuid,
      rootCommitGuid: rootCommitGuid,
      created: Date.now()
    })).to.rejectedWith(Error, 'Request signature algorithm not supported');
  });

  describe('when branching from an existing commit', () => {

    before(async () => {
      createdBranchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      const headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    const firstCommitGuid = generateGUID();
    before(async () => {
      const firstChangeSet = {
        insert: {
          NodeProperty: {
            common: {
            }
          }
        }
      };
      const headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createCommit(createdBranchGuid, headers, {
        guid: firstCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(firstChangeSet),
        meta: {},
        created: Date.now()
      });
    });

    const branchedBranchGuid = 'BranchB' + generateGUID();
    before(async () => {
      const headers = Fixtures.getRequestSignatureHeaders(branchedBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: branchedBranchGuid,
        rootCommitGuid: firstCommitGuid,
        parentBranchGuid: createdBranchGuid,
        meta: {},
        created: Date.now()
      });
    });

    it('should create the branch with correct data', async () => {
      const headers = Fixtures.getRequestSignatureHeaders(branchedBranchGuid);
      const branch = await Fixtures.fetchBranch(branchedBranchGuid, headers);
      expect(branch).to.exist;
      expect(branch.guid).to.eql(branchedBranchGuid);
      expect(branch.rootCommitGuid).to.eql(firstCommitGuid);
    });

    it('should be possible to commit to different branches and get correct MVs', async () => {
      const headersA = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      const changeSetA = {
        modify: {
          NodeProperty: {
            common: {
              insert: {
                String: {
                  a: 'my value is a'
                }
              }
            }
          }
        }
      };
      const commitGuidA = generateGUID();
      await Fixtures.createCommit(createdBranchGuid, headersA, {
        guid: commitGuidA,
        parentGuid: firstCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(changeSetA),
        meta: {},
        created: Date.now()
      });

      const headersB = Fixtures.getRequestSignatureHeaders(branchedBranchGuid);
      const changeSetB = {
        modify: {
          NodeProperty: {
            common: {
              insert: {
                String: {
                  b: 'my value is b'
                }
              }
            }
          }
        }
      };
      const commitGuidB = generateGUID();
      await Fixtures.createCommit(branchedBranchGuid, headersB, {
        guid: commitGuidB,
        parentGuid: firstCommitGuid,
        branchGuid: branchedBranchGuid,
        changeSet: JSON.stringify(changeSetB),
        meta: {},
        created: Date.now()
      });

      const fetchAtA = await Fixtures.fetchMaterializedView(createdBranchGuid, commitGuidA, headersA, {});
      const fetchAtB = await Fixtures.fetchMaterializedView(branchedBranchGuid, commitGuidB, headersB, {});

      expect(fetchAtA.changeSet).to.eql({
        insert: {
          NodeProperty: {
            common: {
              insert: {
                String: {
                  a: 'my value is a'
                }
              }
            }
          }
        }
      });
      expect(fetchAtB.changeSet).to.eql({
        insert: {
          NodeProperty: {
            common: {
              insert: {
                String: {
                  b: 'my value is b'
                }
              }
            }
          }
        }
      });
    });
  });
});
