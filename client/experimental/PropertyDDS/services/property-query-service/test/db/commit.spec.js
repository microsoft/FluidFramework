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
const { ChangeSet } = require('@fluid-experimental/property-changeset');
const getExpressApp = require('../utils/get_express_app');

describe('Commit creation integration test', function() {
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

  describe('On a properly created branch', () => {

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    it('should fail to commit with an invalid request signature', () => {
      return expect(Fixtures.createCommit(createdBranchGuid, {}, {
        guid: firstCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(firstChangeSet),
        meta: {},
        created: Date.now()
      })).to.rejectedWith(Error, 'Request signature algorithm not supported');
    });

    describe('with two commits', () => {

      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
        return Fixtures.createCommit(createdBranchGuid, headers, {
          guid: firstCommitGuid,
          parentGuid: rootCommitGuid,
          branchGuid: createdBranchGuid,
          changeSet: JSON.stringify(firstChangeSet),
          meta: {},
          created: Date.now()
        });
      });

      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
        return Fixtures.createCommit(createdBranchGuid, headers, {
          guid: secondCommitGuid,
          parentGuid: firstCommitGuid,
          branchGuid: createdBranchGuid,
          changeSet: JSON.stringify(secondChangeSet),
          meta: {},
          created: Date.now()
        });
      });

      it('should return that a commit exists when committing an existing commit', () => {
        const headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
        return expect(Fixtures.createCommit(createdBranchGuid, headers, {
          guid: secondCommitGuid,
          parentGuid: firstCommitGuid,
          branchGuid: createdBranchGuid,
          changeSet: JSON.stringify(secondChangeSet),
          meta: {},
          created: Date.now()
        })).to.eventually.eql({status: 'existing'});
      });

      describe('Materialized checkout', () => {
        it('should fail with an invalid request signature', () => {
          return expect(Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, {}, {}))
            .to.rejectedWith(Error, 'Request signature algorithm not supported');
        });

        it('should be possible to perform a full checkout', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            fetchSchemas: false
          });
          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                String: {
                  aFirstString: 'Ground Control To Major Tom',
                  aSecondString: 'Take your protein pills and put',
                  aThirdString: 'Your helmet on',
                  aFourthString: 'Commencing countdown, engines on',
                  aLargeString: Array(LARGE_STRING_SIZE).fill('c').join(''),
                  aThirdLargeString: Array(LARGE_STRING_SIZE).fill('d').join('')
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
                },
                'mysample:fullname-1.0.0': {
                  davidBowie: {
                    String: {
                      first: 'David',
                      last: 'Bowie'
                    }
                  }
                }
              }
            },
            rootCommitGuid: rootCommitGuid
          });
        });

        it('should be possible to perform a partial checkout by paths', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            path: ['aFirstString', 'aSecondString'],
            fetchSchemas: false
          });
          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                String: {
                  aFirstString: 'Ground Control To Major Tom',
                  aSecondString: 'Take your protein pills and put'
                }
              }
            },
            rootCommitGuid: rootCommitGuid
          });
        });

        it('should be possible to perform a partial checkout by paths, following references', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            path: ['aFirstReference'],
            followReferences: true,
            fetchSchemas: false
          });
          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                'Reference<String>': {
                  aFirstReference: '/aFirstString'
                },
                String: {
                  aFirstString: 'Ground Control To Major Tom'
                }
              }
            },
            rootCommitGuid: rootCommitGuid
          });
        });


        it('should be possible to perform a checkout, with paging', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            pagingLimit: 1,
            fetchSchemas: false
          });

          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                'Reference<String>': {
                  'aFirstReference': '/aFirstString'
                },
                String: {
                  aFirstString: 'Ground Control To Major Tom',
                  aFourthString: 'Commencing countdown, engines on',
                  aLargeString: Array(LARGE_STRING_SIZE).fill('c').join('')
                }
              }
            },
            nextPagePath: 'aPoint',
            rootCommitGuid: rootCommitGuid
          });
        });

        it('should be possible to perform a checkout, with paging and a start path', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            pagingLimit: 1,
            pagingStartPath: 'aSecondLargeString',
            fetchSchemas: false
          });

          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                String: {
                  aSecondString: 'Take your protein pills and put',
                  aThirdLargeString: Array(LARGE_STRING_SIZE).fill('d').join(''),
                  aThirdString: 'Your helmet on'
                },
                'mysample:fullname-1.0.0': {
                  davidBowie: {
                    String: {
                      first: 'David',
                      last: 'Bowie'
                    }
                  }
                }
              }
            },
            rootCommitGuid: rootCommitGuid
          });
        });

        it('should be possible to perform a checkout, with ranges', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            rangeStart: 'aLargeString',
            rangeEnd: 'aSecondLargeString',
            fetchSchemas: false
          });
          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                String: {
                  aLargeString: Array(LARGE_STRING_SIZE).fill('c').join('')
                },
                'mysample:point2d-1.0.0': {
                  aPoint: {
                    Float64: {
                      x: 3.14,
                      y: 2.72
                    }
                  }
                }
              }
            },
            rootCommitGuid: rootCommitGuid
          });
        });

        it('should be possible to get template information', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchMaterializedView(createdBranchGuid, secondCommitGuid, headers, {
            fetchSchemas: true
          });
          expect(fetchResult).to.eql({
            changeSet: {
              insert: {
                String: {
                  aFirstString: 'Ground Control To Major Tom',
                  aSecondString: 'Take your protein pills and put',
                  aThirdString: 'Your helmet on',
                  aFourthString: 'Commencing countdown, engines on',
                  aLargeString: Array(LARGE_STRING_SIZE).fill('c').join(''),
                  aThirdLargeString: Array(LARGE_STRING_SIZE).fill('d').join('')
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
              insertTemplates: {
                'mysample:point2d-1.0.0': {
                  typeid: 'mysample:point2d-1.0.0',
                  inherits: 'NamedProperty',
                  properties: [
                    { id: 'x', typeid: 'Float64' },
                    { id: 'y', typeid: 'Float64' }
                  ]
                },
                'mysample:fullname-1.0.0': {
                  typeid: 'mysample:fullname-1.0.0',
                  inherits: 'NamedProperty',
                  properties: [
                    { id: 'first', typeid: 'String' },
                    { id: 'last', typeid: 'String' }
                  ]
                }
              }
            },
            rootCommitGuid: rootCommitGuid
          });
        });
      });

      describe('Single commit checkout', () => {
        it('should fail with an invalid request signature', () => {
          return expect(Fixtures.fetchSingleCommit(createdBranchGuid, secondCommitGuid, {}))
            .to.rejectedWith(Error, 'Request signature algorithm not supported');
        });

        it('should be possible to do a full checkout of the single commit', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchSingleCommit(createdBranchGuid, secondCommitGuid, headers, {
            fetchSchemas: false
          });
          expect(fetchResult).to.eql({changeSet: {
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
            modify: {
              String: {
                aLargeString: {
                  oldValue: Array(LARGE_STRING_SIZE).fill('a').join(''),
                  value: Array(LARGE_STRING_SIZE).fill('c').join('')
                }
              }
            },
            remove: {
              String: {
                aSecondLargeString: Array(LARGE_STRING_SIZE).fill('b').join('')
              }
            }
          }});
        });

        it('should be possible to do a partial checkout of the single commit by paths', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchSingleCommit(createdBranchGuid, secondCommitGuid, headers, {
            path: ['aFourthString', 'aSecondLargeString'],
            fetchSchemas: false
          });
          expect(fetchResult).to.eql({changeSet: {
            insert: {
              String: {
                aFourthString: 'Commencing countdown, engines on'
              }
            },
            remove: {
              String: {
                aSecondLargeString: Array(LARGE_STRING_SIZE).fill('b').join('')
              }
            }
          }});
        });

        it('should be possible to do a partial checkout of the single commit by ranges', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchSingleCommit(createdBranchGuid, secondCommitGuid, headers, {
            rangeStart: 'aLargeString',
            rangeEnd: 'aSecondLargeString',
            fetchSchemas: false
          });
          expect(fetchResult).to.eql({changeSet: {
            modify: {
              String: {
                aLargeString: {
                  oldValue: Array(LARGE_STRING_SIZE).fill('a').join(''),
                  value: Array(LARGE_STRING_SIZE).fill('c').join('')
                }
              }
            }
          }});
        });

        it('should be possible to get template information of the single commit', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          let fetchResult = await Fixtures.fetchSingleCommit(createdBranchGuid, secondCommitGuid, headers, {
            fetchSchemas: true
          });
          expect(fetchResult).to.eql({
            changeSet: {
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
              modify: {
                String: {
                  aLargeString: {
                    oldValue: Array(LARGE_STRING_SIZE).fill('a').join(''),
                    value: Array(LARGE_STRING_SIZE).fill('c').join('')
                  }
                }
              },
              remove: {
                String: {
                  aSecondLargeString: Array(LARGE_STRING_SIZE).fill('b').join('')
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
            }
          });
        });
      });
    });
  });

  describe('Materialized checkout', () => {

    /* create a large changeSet to test the limitation on
    the number of items that can be checked out */
    let largeArray = {};
    let largeArrayPath = [];
    for (let i = 0; i < 1000; i++) {
      largeArray[i] = 'something';
      largeArrayPath.push(i.toString());
    }
    const largeChangeSet = {
      insert: {
        String: largeArray
      }
    };

    before(() => {
      createdBranchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      firstCommitGuid = generateGUID();
    });

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      return Fixtures.createCommit(createdBranchGuid, headers, {
        guid: firstCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(largeChangeSet),
        meta: {},
        created: Date.now()
      });
    });

    it('should be possible to perform a partial checkout without limitation on the number of items', async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      let fetchResult = await Fixtures.fetchMaterializedViewByPost(createdBranchGuid, firstCommitGuid, headers, {
        path: largeArrayPath,
        fetchSchemas: false
      });
      expect(fetchResult).to.eql({
        changeSet: {
          insert: {
            String: largeArray
          }
        },
        rootCommitGuid: rootCommitGuid
      });
    });
  });

  describe('On a separate branch', () => {

    const chunkableChangeSetWithEmptyProperty = {
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
        'mysample:empty-1.0.0': {
          aPropertyThatIsEmpty: {
          }
        }
      }
    };

    let invalidCommitGuid;

    before(() => {
      createdBranchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      invalidCommitGuid = generateGUID();
    });

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    it('should not hang with a chunkable change set containing an empty property', () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      return expect(Fixtures.createCommit(createdBranchGuid, headers, {
        guid: invalidCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(chunkableChangeSetWithEmptyProperty),
        meta: {},
        created: Date.now()
      })).to.be.fulfilled;
    });
  });

  describe('On a separate branch', () => {

    before(() => {
      createdBranchGuid = generateGUID();
      rootCommitGuid = generateGUID();
    });

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    it('should not hang when a change set modifies non-existing paths', async () => {
      const insertCommitGuid = generateGUID();
      const insertChangeSet = require('./data/modifyNonExistingPath/insert_change_set');
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createCommit(createdBranchGuid, headers, {
        guid: insertCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(insertChangeSet),
        meta: {},
        created: Date.now()
      });

      const modifyCommitGuid = generateGUID();
      const modifyChangeSet = require('./data/modifyNonExistingPath/modify_change_set');
      headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await expect(Fixtures.createCommit(createdBranchGuid, headers, {
        guid: modifyCommitGuid,
        parentGuid: insertCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(modifyChangeSet),
        meta: {},
        created: Date.now()
      })).to.be.rejectedWith('Invalid path in ChangeSet: assets[FolderAsset-0001].entries');
    });
  });

  describe('On a separate branch', () => {

    before(() => {
      createdBranchGuid = generateGUID();
      rootCommitGuid = generateGUID();
    });

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    it('should correctly process enums, even in chunk boundaries', async () => {
      const insertCommitGuid = generateGUID();
      const insertChangeSet = {
        insert: {
          NodeProperty: {
            container: {
            }
          }
        },
        insertTemplates: {
          'my.sample:status-1.0.0': {
            typeid: 'my.sample:status-1.0.0',
            inherits: 'Enum',
            properties: [
              {
                id: 'STARTED',
                value: 0
              },
              {
                id: 'COMPLETED',
                value: 1
              },
              {
                id: 'FAILED',
                value: 2
              }
            ]
          }
        }
      };
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createCommit(createdBranchGuid, headers, {
        guid: insertCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(insertChangeSet),
        meta: {},
        created: Date.now()
      });

      let resultChangeSet = new ChangeSet();
      resultChangeSet.applyChangeSet(insertChangeSet);
      const insertEnum = {
        modify: {
          NodeProperty: {
            container: {
              insert: {
                'enum<my.sample:status-1.0.0>': {
                }
              }
            }
          }
        }
      };
      for (let i = 0; i < 4000; i++) {
        const key = `myStatus${i.toString().padStart(4, '0')}`;
        insertEnum.modify.NodeProperty.container.insert['enum<my.sample:status-1.0.0>'][key] = i % 3;
      }
      resultChangeSet.applyChangeSet(insertEnum);
      const commitGuid = generateGUID();
      await Fixtures.createCommit(createdBranchGuid, headers, {
        guid: commitGuid,
        parentGuid: insertCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(insertEnum),
        meta: {},
        created: Date.now()
      });

      const mv = await Fixtures.fetchMaterializedView(createdBranchGuid, commitGuid, headers);
      expect(mv.changeSet).to.deep.equal(JSON.parse(resultChangeSet.toString()));
    });
  });

  describe('On a separate branch', () => {

    before(() => {
      createdBranchGuid = generateGUID();
      rootCommitGuid = generateGUID();
    });

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    it('should correctly process references, even in chunk boundaries', async () => {
      const insertCommitGuid = generateGUID();
      const insertChangeSet = {
        insert: {
          NodeProperty: {
            container: {
            }
          }
        },
        insertTemplates: {
          'my.sample:space-1.0.0': {
            typeid: 'my.sample:space-1.0.0',
            inherits: 'NamedNodeProperty',
            properties: [
              { id: 'assets', typeid: 'NamedNodeProperty', context: 'map' }
            ]
          },
          'my.sample:customSpace-1.0.0': {
            typeid: 'my.sample:customSpace-1.0.0',
            inherits: 'my.sample:space-1.0.0',
            properties: [
              { id: 'related', typeid: 'Reference<my.sample:customSpace-1.0.0>' }
            ]
          }
        }
      };
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createCommit(createdBranchGuid, headers, {
        guid: insertCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(insertChangeSet),
        meta: {},
        created: Date.now()
      });

      let resultChangeSet = new ChangeSet();
      resultChangeSet.applyChangeSet(insertChangeSet);
      const insertReferences = {
        modify: {
          NodeProperty: {
            container: {
              insert: {
                'my.sample:customSpace-1.0.0': {
                }
              }
            }
          }
        }
      };
      let previousKey = '';
      for (let i = 0; i < 600; i++) {
        const key = `mySpace${i.toString().padStart(3, '0')}`;
        insertReferences.modify.NodeProperty.container.insert['my.sample:customSpace-1.0.0'][key] = {
          'map<NamedNodeProperty>': {
            assets: {}
          },
          'Reference<my.sample:customSpace-1.0.0>': {
            related: previousKey
          }
        };
        previousKey = 'container.' + key;
      }
      resultChangeSet.applyChangeSet(insertReferences);
      const commitGuid = generateGUID();
      await Fixtures.createCommit(createdBranchGuid, headers, {
        guid: commitGuid,
        parentGuid: insertCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(insertReferences),
        meta: {},
        created: Date.now()
      });

      const mv = await Fixtures.fetchMaterializedView(createdBranchGuid, commitGuid, headers);
      expect(mv.changeSet).to.deep.equal(JSON.parse(resultChangeSet.toString()));
    });
  });

  describe('On a separate branch', () => {

    before(() => {
      createdBranchGuid = generateGUID();
      rootCommitGuid = generateGUID();
    });

    before(async () => {
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createBranch(headers, {
        guid: createdBranchGuid,
        rootCommitGuid: rootCommitGuid,
        meta: {},
        created: Date.now()
      });
    });

    it('should support querying and sorting paths with special characters', async () => {
      const insertCommitGuid = generateGUID();
      const insertChangeSet = {
        insert: {
          String: {
          },
          NodeProperty: {
            container: {
              insert: {
                'my:template-1.0.0': {
                  '/does: "this=work? t1': {
                    'String': {
                      'more " quotes': 't1'
                    }
                  },
                  '/does: "this=work? t2': {
                    'String': {
                      'more " quotes': 't2'
                    }
                  }
                }
              }
            }
          }
        },
        insertTemplates: {
          'my:template-1.0.0': {
            typeid: 'my:template-1.0.0',
            properties: [
              { id: 'more " quotes', typeid: 'String' }
            ]
          }
        }
      };
      for (let i = 0; i < 10; i++) {
        insertChangeSet.insert.String[`/does: "this=work?${i}`] = 'I hope so';
      }
      let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
      await Fixtures.createCommit(createdBranchGuid, headers, {
        guid: insertCommitGuid,
        parentGuid: rootCommitGuid,
        branchGuid: createdBranchGuid,
        changeSet: JSON.stringify(insertChangeSet),
        meta: {},
        created: Date.now()
      });

      let mv = await Fixtures.fetchMaterializedView(createdBranchGuid, insertCommitGuid, headers, {
        path: ['"/does: \\"this=work?7"'],
        fetchSchemas: false
      });
      expect(mv.changeSet).to.deep.equal({
        insert: {
          String: {
            '/does: "this=work?7': 'I hope so'
          }
        }
      });

      mv = await Fixtures.fetchMaterializedView(createdBranchGuid, insertCommitGuid, headers, {
        rangeStart: '"/does: \\"this=work?4"',
        rangeEnd: '"/does: \\"this=work?6"',
        fetchSchemas: false
      });
      expect(mv.changeSet).to.deep.equal({
        insert: {
          String: {
            '/does: "this=work?4': 'I hope so',
            '/does: "this=work?5': 'I hope so'
          }
        }
      });

      mv = await Fixtures.fetchMaterializedView(createdBranchGuid, insertCommitGuid, headers, {
        query: [{
          queryLanguage: 'queryV1',
          from: [{
            pathPrefix: 'container',
            typeId: 'my:template-1.0.0'
          }],
          paging: {
            order: [{
              direction: 'DESC'
            }],
            limit: 1,
            offset: 1
          }
        }],
        fetchSchemas: false
      });
      expect(mv.changeSet).to.deep.equal({
        insert: {
          NodeProperty: {
            container: {
              insert: {
                'my:template-1.0.0': {
                  '/does: "this=work? t1': {
                    'String': {
                      'more " quotes': 't1'
                    }
                  }
                }
              }
            }
          }
        }
      });
    });
  });
});
