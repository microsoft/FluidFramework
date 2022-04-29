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

describe('Paging integration test', function() {
  this.timeout(20000);
  let createdBranchGuid = generateGUID();
  let rootCommitGuid = generateGUID();
  let firstCommitGuid = generateGUID();
  let secondCommitGuid = generateGUID();

  let server = new MHServer({
    systemMonitor: PluginManager.instance.systemMonitor
  });

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
    insertTemplates: {
      'mysample:point2d-1.0.0': {
        'typeid': 'mysample:point2d-1.0.0',
        'inherits': 'NamedProperty',
        'properties': [
          {
            'id': 'x',
            'typeid': 'Float64'
          },
          {
            'id': 'y',
            'typeid': 'Float64'
          }
        ]
      }
    },
    insert: {
      'map<mysample:point2d-1.0.0>': {
        myPointsMap: {
          insert: {
            'mysample:point2d-1.0.0': {
              'pointA': {
                Float64: {
                  x: 16.0,
                  y: 32.0
                }
              },
              'pointB': {
                Float64: {
                  x: 8.0,
                  y: 16.0
                }
              },
              'pointC': {
                Float64: {
                  x: 4.0,
                  y: 8.0
                }
              },
              'pointD': {
                Float64: {
                  x: 2.0,
                  y: 4.0
                }
              },
              'pointE': {
                Float64: {
                  x: 1.0,
                  y: 2.0
                }
              }
            }
          }
        }
      },
      String: {
        a: 'string that shouldn\'t matter',
        another: 'stringThatShouldn\'t matter'
      }
    }
  };

  const secondChangeSet = {
    modify: {
      'map<mysample:point2d-1.0.0>': {
        myPointsMap: {
          insert: {
            'mysample:point2d-1.0.0': {
              'pointF': {
                Float64: {
                  x: -16.0,
                  y: -32.0
                }
              },
              'pointG': {
                Float64: {
                  x: -8.0,
                  y: -16.0
                }
              },
              'pointH': {
                Float64: {
                  x: -4.0,
                  y: -8.0
                }
              },
              'pointI': {
                Float64: {
                  x: -2.0,
                  y: -4.0
                }
              },
              'pointJ': {
                Float64: {
                  x: -1.0,
                  y: -2.0
                }
              }
            }
          }
        }
      }
    }
  };

  describe('On a properly created branch', () => {

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {}
      });
    });

    describe('with two commits', () => {

      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
        return Fixtures.createCommit(createdBranchGuid, headers, {
          guid: firstCommitGuid,
          parentGuid: rootCommitGuid,
          branchGuid: createdBranchGuid,
          changeSet: JSON.stringify(firstChangeSet),
          meta: {}
        });
      });

      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
        return Fixtures.createCommit(createdBranchGuid, headers, {
          guid: secondCommitGuid,
          parentGuid: firstCommitGuid,
          branchGuid: createdBranchGuid,
          changeSet: JSON.stringify(secondChangeSet),
          meta: {}
        });
      });

      describe('Paged Materialized checkout', () => {

        it('should be possible to perform a paged checkout of a map', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);

          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            query: [{
              queryLanguage: 'queryV1',
              from: [{
                pathPrefix: 'myPointsMap',
                typeId: 'mysample:point2d-1.0.0'
              }],
              paging: {
                order: [{
                  by: 'y',
                  direction: 'DESC'
                }],
                limit: 3,
                offset: 5
              }
            }]
          });

          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                'map<mysample:point2d-1.0.0>': {
                  myPointsMap: {
                    insert: {
                      'mysample:point2d-1.0.0': {
                        pointH: {
                          Float64: {
                            x: -4,
                            y: -8
                          }
                        },
                        pointI: {
                          Float64: {
                            x: -2,
                            y: -4
                          }
                        },
                        pointJ: {
                          Float64: {
                            x: -1,
                            y: -2
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            queryPaths: [
              'myPointsMap.pointJ',
              'myPointsMap.pointI',
              'myPointsMap.pointH'
            ],
            rootCommitGuid: rootCommitGuid
          });
        });
      });
    });
  });
});
