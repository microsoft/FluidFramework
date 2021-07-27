/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* globals targets */
const _ = require('lodash');
const Fixtures = require('./fixtures');
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const MHServer = require('../../src/server/server');
const getPort = require('get-port');
const PluginManager = require('../../src/plugins/PluginManager');
const getExpressApp = require('../utils/get_express_app');

describe('Index query tests', function() {
  this.timeout(20000);

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

  describe('with simple indices', () => {
    let branchGuid, rootCommitGuid, indexNames, indexDefs;

    const comparePaths = (expected, actual, checkOrder) => {
      if (checkOrder) {
        expect(actual).to.eql(expected);
      } else {
        expect(new Set(actual)).to.eql(new Set(expected));
      }
    };
    const checkIndexQueryResult = async (commitGuid, query, paths) => {
      const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
      const expected = await Fixtures.fetchMaterializedView(branchGuid, commitGuid, headers, {
        path: paths
      });
      let result = await Fixtures.fetchMaterializedView(branchGuid, commitGuid, headers, { query });
      expect(result.changeSet).to.eql(expected.changeSet);
      comparePaths(result.queryPaths, paths, !!query[0].paging);
      delete query[0].from[0].useIndex;
      result = await Fixtures.fetchMaterializedView(branchGuid, commitGuid, headers, { query });
      expect(result.changeSet).to.eql(expected.changeSet);
      comparePaths(result.queryPaths, paths, !!query[0].paging);
    };

    before(() => {
      branchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      indexNames = ['thingsByName'/*, 'thingsByLatitude'*/];
      indexDefs = [{
        fields: [
          { typeId: 'String', name: 'name' }
        ],
        include: [
          { schema: 'NamedNodeProperty' }
        ]
      }, {
        fields: [
          { typeId: 'Single', name: 'latitude' }
        ],
        include: [
          { schema: 'NamedNodeProperty' }
        ]
      }];
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {}
        }
      };
      for (let i = 0; i < indexNames.length; i++) {
        meta.materializedHistory.indices[indexNames[i]] = indexDefs[i];
      }

      const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
      return Fixtures.createBranch(headers, {
        guid: branchGuid,
        rootCommitGuid,
        meta
      });
    });

    let firstCommitGuid;
    before(() => {
      firstCommitGuid = generateGUID();
      const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
      return Fixtures.createCommit(branchGuid, headers, {
        guid: firstCommitGuid,
        branchGuid,
        parentGuid: rootCommitGuid,
        meta: {},
        changeSet: {
          insert: {
            NamedNodeProperty: {
              topLevelThing: {
                String: {
                  guid: '00000000-0000-0000-0000-000000000001'
                },
                insert: {
                  String: {
                    name: 'Thing'
                  }
                }
              },
              topLevelNotThing: {
                String: {
                  guid: '00000000-0000-0000-0000-000000000002'
                },
                insert: {
                  String: {
                    name: 'Not thing'
                  }
                }
              }
            },
            NodeProperty: {
              l1: {
                insert: {
                  NamedNodeProperty: {
                    level1Thing: {
                      String: {
                        guid: '00000000-0000-0000-0000-000000000003'
                      },
                      insert: {
                        String: {
                          name: 'Thing'
                        }
                      }
                    }
                  },
                  NodeProperty: {
                    l2: {
                      insert: {
                        NamedNodeProperty: {
                          notThingInLevel2: {
                            String: {
                              guid: '00000000-0000-0000-0000-000000000004'
                            },
                            insert: {
                              String: {
                                name: 'Not thing'
                              }
                            }
                          }
                        },
                        NodeProperty: {
                          l3: {
                            insert: {
                              NamedNodeProperty: {
                                deepNestedThing: {
                                  String: {
                                    guid: '00000000-0000-0000-0000-000000000005'
                                  },
                                  insert: {
                                    String: {
                                      name: 'Thing'
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
    });

    describe('when validating index support for query', () => {
      it('should throw an error when trying to use an index that does not exist', async () => {
        const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        await expect(Fixtures.fetchMaterializedView(branchGuid, firstCommitGuid, headers, {
          query: [{
            queryLanguage: 'queryV1',
            from: [{
              pathPrefix: 'notImportant',
              typeId: 'notImportant',
              depthLimit: -1,
              where: {
                eq: {
                  name: 'notImportant'
                }
              },
              useIndex: 'doesNotExist'
            }]
          }]
        })).to.be.rejectedWith(`Index 'doesNotExist' used in query does not exist on branch '${branchGuid}'`);
      });

      it('should throw an error when trying to use an index that does not support the queried type id', async () => {
        const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        await expect(Fixtures.fetchMaterializedView(branchGuid, firstCommitGuid, headers, {
          query: [{
            queryLanguage: 'queryV1',
            from: [{
              pathPrefix: 'notImportant',
              typeId: 'typeIdNotIncluded',
              depthLimit: -1,
              where: {
                eq: {
                  name: 'notImportant'
                }
              },
              useIndex: indexNames[0]
            }]
          }]
        })).to.be.rejectedWith(`Cannot query index '${indexNames[0]}' on branch '${branchGuid}'. ` +
          'Index does not cover schema \'typeIdNotIncluded\'');
      });

      it('should throw an error when filtering by a field not included by the index', async () => {
        const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        await expect(Fixtures.fetchMaterializedView(branchGuid, firstCommitGuid, headers, {
          query: [{
            queryLanguage: 'queryV1',
            from: [{
              pathPrefix: 'notImportant',
              typeId: 'NamedNodeProperty',
              depthLimit: -1,
              where: {
                eq: {
                  doesNotExist: 'notImportant'
                }
              },
              useIndex: indexNames[0]
            }]
          }]
        })).to.be.rejectedWith(`Cannot query index '${indexNames[0]}' on branch '${branchGuid}'. ` +
          'Index does not include field \'doesNotExist\'');
      });
    });

    describe('when using no depth limit and no path prefix', () => {
      let query, expectedPaths;
      before(() => {
        query = [{
          queryLanguage: 'queryV1',
          from: [{
            pathPrefix: '',
            typeId: 'NamedNodeProperty',
            depthLimit: -1,
            where: {
              eq: {
                name: 'Thing'
              }
            },
            useIndex: indexNames[0]
          }]
        }];
        expectedPaths = ['topLevelThing', 'l1.level1Thing', 'l1.l2.l3.deepNestedThing'];
      });

      it('should return the expected data and it should match the one obtained without an index', async () => {
        await checkIndexQueryResult(firstCommitGuid, query, expectedPaths);
      });
    });

    describe('when using path prefix and no depth limit', () => {
      let query, expectedPaths;
      before(() => {
        query = [{
          queryLanguage: 'queryV1',
          from: [{
            pathPrefix: 'l1',
            typeId: 'NamedNodeProperty',
            depthLimit: -1,
            where: {
              eq: {
                name: 'Thing'
              }
            },
            useIndex: indexNames[0]
          }]
        }];
        expectedPaths = ['l1.level1Thing', 'l1.l2.l3.deepNestedThing'];
      });

      it('should return the expected data and it should match the one obtained without an index', async () => {
        await checkIndexQueryResult(firstCommitGuid, query, expectedPaths);
      });
    });

    describe('when using depth limit with no path prefix', () => {
      let query, expectedPaths;
      before(() => {
        query = [{
          queryLanguage: 'queryV1',
          from: [{
            pathPrefix: '',
            typeId: 'NamedNodeProperty',
            depthLimit: 2,
            where: {
              eq: {
                name: 'Thing'
              }
            },
            useIndex: indexNames[0]
          }]
        }];
        expectedPaths = ['topLevelThing', 'l1.level1Thing'];
      });

      it('should return the expected data and it should match the one obtained without an index', async () => {
        await checkIndexQueryResult(firstCommitGuid, query, expectedPaths);
      });
    });

    describe('when using both path prefix and depth limit', () => {
      let query, expectedPaths;
      before(() => {
        query = [{
          queryLanguage: 'queryV1',
          from: [{
            pathPrefix: 'l1',
            typeId: 'NamedNodeProperty',
            depthLimit: 1,
            where: {
              eq: {
                name: 'Thing'
              }
            },
            useIndex: indexNames[0]
          }]
        }];
        expectedPaths = ['l1.level1Thing'];
      });

      it('should return the expected data and it should match the one obtained without an index', async () => {
        await checkIndexQueryResult(firstCommitGuid, query, expectedPaths);
      });
    });

    describe('when querying ranges', () => {
      let secondCommitGuid, baseQuery;

      before(async () => {
        secondCommitGuid = generateGUID();
        const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        await Fixtures.createCommit(branchGuid, headers, {
          guid: secondCommitGuid,
          branchGuid,
          parentGuid: firstCommitGuid,
          meta: {},
          changeSet: {
            modify: {
              NamedNodeProperty: {
                topLevelThing: {
                  insert: {
                    Float32: {
                      latitude: -34.9011
                    }
                  }
                },
                topLevelNotThing: {
                  insert: {
                    Float32: {
                      latitude: 45.5017
                    }
                  }
                }
              },
              NodeProperty: {
                l1: {
                  modify: {
                    NamedNodeProperty: {
                      level1Thing: {
                        insert: {
                          Float32: {
                            latitude: 0
                          }
                        }
                      }
                    },
                    NodeProperty: {
                      l2: {
                        modify: {
                          NamedNodeProperty: {
                            notThingInLevel2: {
                              insert: {
                                Float32: {
                                  latitude: 42.4806
                                }
                              }
                            }
                          },
                          NodeProperty: {
                            l3: {
                              modify: {
                                NamedNodeProperty: {
                                  deepNestedThing: {
                                    insert: {
                                      Float32: {
                                        latitude: -23.5505
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        });

        baseQuery = [{
          queryLanguage: 'queryV1',
          from: [{
            pathPrefix: '',
            typeId: 'NamedNodeProperty',
            depthLimit: -1,
            where: {
            },
            useIndex: indexNames[1]
          }]
        }];
      });

      it('should handle lte as expected', async () => {
        const query = _.cloneDeep(baseQuery);
        query[0].from[0].where.lte = {
          latitude: 0
        };
        const expectedPaths = ['topLevelThing', 'l1.level1Thing', 'l1.l2.l3.deepNestedThing'];
        await checkIndexQueryResult(secondCommitGuid, query, expectedPaths);
      });

      it('should handle lt as expected', async () => {
        const query = _.cloneDeep(baseQuery);
        query[0].from[0].where.lt = {
          latitude: 0
        };
        const expectedPaths = ['topLevelThing', 'l1.l2.l3.deepNestedThing'];
        await checkIndexQueryResult(secondCommitGuid, query, expectedPaths);
      });

      it('should handle gte as expected', async () => {
        const query = _.cloneDeep(baseQuery);
        query[0].from[0].where.gte = {
          latitude: 0
        };
        const expectedPaths = ['topLevelNotThing', 'l1.level1Thing', 'l1.l2.notThingInLevel2'];
        await checkIndexQueryResult(secondCommitGuid, query, expectedPaths);
      });

      it('should handle gt as expected', async () => {
        const query = _.cloneDeep(baseQuery);
        query[0].from[0].where.gt = {
          latitude: 0
        };
        const expectedPaths = ['topLevelNotThing', 'l1.l2.notThingInLevel2'];
        await checkIndexQueryResult(secondCommitGuid, query, expectedPaths);
      });
    });

    describe('when querying with paging and sorting', () => {
      let newCommitGuid, baseCommitGuid, baseQuery;

      before(async () => {
        newCommitGuid = generateGUID();
        const headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        const branch = await Fixtures.fetchBranch(branchGuid, headers);
        baseCommitGuid = branch.headCommitGuid;
        await Fixtures.createCommit(branchGuid, headers, {
          guid: newCommitGuid,
          branchGuid,
          parentGuid: baseCommitGuid,
          meta: {},
          changeSet: {
            modify: {
              NamedNodeProperty: {
                topLevelThing: {
                  modify: {
                    String: {
                      name: 'Joanna'
                    }
                  }
                },
                topLevelNotThing: {
                  modify: {
                    String: {
                      name: 'Albert'
                    }
                  }
                }
              },
              NodeProperty: {
                l1: {
                  modify: {
                    NamedNodeProperty: {
                      level1Thing: {
                        modify: {
                          String: {
                            name: 'Zach'
                          }
                        }
                      }
                    },
                    NodeProperty: {
                      l2: {
                        modify: {
                          NamedNodeProperty: {
                            notThingInLevel2: {
                              modify: {
                                String: {
                                  name: 'Paul'
                                }
                              }
                            }
                          },
                          NodeProperty: {
                            l3: {
                              modify: {
                                NamedNodeProperty: {
                                  deepNestedThing: {
                                    modify: {
                                      String: {
                                        name: 'Mary'
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        });

        baseQuery = [{
          queryLanguage: 'queryV1',
          from: [{
            pathPrefix: '',
            typeId: 'NamedNodeProperty',
            depthLimit: -1,
            where: {
            },
            useIndex: indexNames[0]
          }],
          paging: {
            order: [{
              by: 'name'
            }]
          }
        }];
      });

      it('should handle sorting in ascending order', async () => {
        const query = _.cloneDeep(baseQuery);
        query[0].paging.order[0].direction = 'ASC';
        query[0].paging.offset = 1;
        query[0].paging.limit = 2;
        const expectedPaths = ['topLevelThing', 'l1.l2.l3.deepNestedThing'];
        await checkIndexQueryResult(newCommitGuid, query, expectedPaths);
      });

      it('should handle sorting in descending order', async () => {
        const query = _.cloneDeep(baseQuery);
        query[0].paging.order[0].direction = 'DESC';
        query[0].paging.offset = 2;
        query[0].paging.limit = 3;
        const expectedPaths = ['l1.l2.l3.deepNestedThing', 'topLevelThing', 'topLevelNotThing'];
        await checkIndexQueryResult(newCommitGuid, query, expectedPaths);
      });

      it('should handle sorting and paging when filtering', async () => {
        const query = _.cloneDeep(baseQuery);
        query[0].from[0].where = {
          lt: {
            name: 'Sofia'
          }
        };
        query[0].paging.order[0].direction = 'DESC';
        query[0].paging.offset = 1;
        query[0].paging.limit = 2;
        const expectedPaths = ['l1.l2.l3.deepNestedThing', 'topLevelThing'];
        await checkIndexQueryResult(newCommitGuid, query, expectedPaths);
      });
    });
  });
});
