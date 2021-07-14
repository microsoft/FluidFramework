/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* eslint max-nested-callbacks: 0 */
/* globals targets */

const Fixtures = require('./fixtures');
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const MHServer = require('../../src/server/server');
const getPort = require('get-port');
const PluginManager = require('../../src/plugins/PluginManager');
const getExpressApp = require('../utils/get_express_app');

describe('Async task commit flow', function() {
  this.timeout(20000);

  const LARGE_STRING_SIZE = 32768;

  let createdBranchGuid = generateGUID();
  let rootCommitGuid = generateGUID();
  let firstCommitGuid = generateGUID();
  let secondCommitGuid = generateGUID();
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

  const firstChangeSet = {
    insert: {
      String: {
        aFirstString: 'Ground Control To Major Tom',
        aSecondString: 'Take your protein pills and put',
        aThirdString: 'Your helmet on',
        aLargeString: Array(LARGE_STRING_SIZE).fill('a').join(''),
        aSecondLargeString: Array(LARGE_STRING_SIZE).fill('b').join('')
      },
      'Reference<String>': {
        aFirstReference: '/aFirstString'
      },
      'mysample:point2d-1.0.0': {
        aPoint: {
          Float64: {
            x: 3.14,
            y: 2.72
          }
        }
      }
    },
    insertTemplates: {
      'mysample:point2d-1.0.0': {
        typeid: 'mysample:point2d-1.0.0',
        inherits: 'NamedProperty',
        properties: [
          { id: 'x', typeid: 'Float64' },
          { id: 'y', typeid: 'Float64' }
        ]
      }
    }
  };

  const secondChangeSet = {
    insert: {
      String: {
        aFourthString: 'Commencing countdown, engines on',
        aThirdLargeString: Array(LARGE_STRING_SIZE).fill('d').join('')
      },
      'mysample:fullname-1.0.0': {
        davidBowie: {
          String: {
            first: 'David',
            last: 'Bowie'
          }
        }
      }
    },
    remove: ['aSecondLargeString'],
    modify: {
      String: {
        aLargeString: Array(LARGE_STRING_SIZE).fill('c').join('')
      }
    },
    insertTemplates: {
      'mysample:fullname-1.0.0': {
        typeid: 'mysample:fullname-1.0.0',
        inherits: 'NamedProperty',
        properties: [
          { id: 'first', typeid: 'String' },
          { id: 'last', typeid: 'String' }
        ]
      }
    }
  };

  it('should create a branch', async () => {
    let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
    await Fixtures.createBranch(headers, {
      guid: createdBranchGuid,
      rootCommitGuid: rootCommitGuid,
      meta: {},
      created: Date.now()
    });
  });

  it('should create two commits', async () => {
    let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
    return Promise.all([
      Fixtures.createCommitAsync(createdBranchGuid, headers, {
        guid: firstCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(firstChangeSet),
        meta: {},
        created: Date.now()
      }),
      Fixtures.createCommitAsync(createdBranchGuid, headers, {
        guid: secondCommitGuid,
        parentGuid: firstCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(secondChangeSet),
        meta: {},
        created: Date.now()
      })
    ]);
  });

  it('should have created the commits properly', async () => {
    let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
    await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
      fetchSchemas: false
    });
  });
});
