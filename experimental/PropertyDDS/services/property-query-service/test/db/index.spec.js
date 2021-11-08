/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
const { generateGUID } = require('@fluid-experimental/property-common').GuidUtils;
const Long = require("long");
const createMhs = require('../utils/create_mhs');

describe('Index db tests', () => {
  let backend, mhService;
  before(() => {
    ({ backend, mhService } = createMhs());
    return mhService.init();
  });

  after(() => mhService.stop());

  const createSingleColumnIndexMV = (values) => {
    if (!values || values.length === 0) {
      return {};
    }
    const mv = {
      insert: {
        NodeProperty: {}
      }
    };
    for (const [key, path] of values) {
      const item = {
        insert: {
          NodeProperty: {}
        }
      };
      if (Array.isArray(path)) {
        for (const singlePath of path) {
          item.insert.NodeProperty[singlePath] = {};
        }
      } else {
        item.insert.NodeProperty[path] = {};
      }
      mv.insert.NodeProperty[key] = item;
    }
    return mv;
  };

  describe('when creating simple one column indices through branch metadata', () => {
    let branchGuid, rootCommitGuid, indexNames, indexDefs;
    before(() => {
      branchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      indexNames = ['peopleByFirstName', 'thingsByAge', 'peopleByHavingFun', 'peopleByDistanceToUranus'];
      indexDefs = [{
        fields: [
          { typeId: 'String', name: 'firstName' }
        ],
        include: [
          { schema: 'example:person-1.0.0' }
        ]
      }, {
        fields: [
          { typeId: 'Integer', name: 'age' }
        ],
        include: [
          { schema: 'example:person-1.0.0' },
          { schema: 'example:extraterrestrial-1.0.0' },
          { schema: 'example:planet-1.0.0' }
        ]
      }, {
        fields: [
          { typeId: 'Boolean', name: 'havingFun' }
        ],
        include: [
          { schema: 'example:person-1.0.0' }
        ]
      }, {
        fields: [
          { typeId: 'Double', name: 'distanceToUranus' }
        ],
        include: [
          { schema: 'example:person-1.0.0' }
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

      return mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      });
    });

    it('should create the indices from the branch metadata', async () => {
      const branch = await mhService.getBranch(branchGuid);
      expect(branch.indices).to.exist;
      for (let i = 0; i < indexNames.length; i++) {
        expect(branch.indices[indexNames[i]]).to.exist;
        expect(branch.indices[indexNames[i]].def).to.eql(indexDefs[i]);
        expect(branch.indices[indexNames[i]].head).to.eql({
          guid: rootCommitGuid,
          sequence: 0
        });
      }
    });

    it('should have created a root commit node for each index', async () => {
      for (let i = 0; i < indexNames.length; i++) {
        const indexCommitRootNode = await backend.get(`commitIndex#${branchGuid}#${indexNames[i]}:${rootCommitGuid}`);
        expect(indexCommitRootNode).to.exist;
        expect(JSON.parse(indexCommitRootNode).rootNodeRef).to.exist;
      }
    });

    let firstCommitGuid;
    describe('when inserting data that matches the index include criteria', () => {
      before(async () => {
        firstCommitGuid = generateGUID();
        await mhService.createCommit({
          guid: firstCommitGuid,
          branchGuid,
          parentGuid: rootCommitGuid,
          changeSet: {
            insert: {
              'map<example:person-1.0.0>': {
                people: {
                  insert: {
                    'example:person-1.0.0': {
                      '00000000-0000-0000-0000-000000000001': {
                        String: {
                          guid: '00000000-0000-0000-0000-000000000001',
                          firstName: 'Albert',
                          lastName: 'Einstein'
                        },
                        Int32: {
                          age: 50
                        },
                        Boolean: {
                          havingFun: false
                        },
                        Float64: {
                          distanceToUranus: 3.2e9
                        }
                      },
                      '00000000-0000-0000-0000-000000000002': {
                        String: {
                          guid: '00000000-0000-0000-0000-000000000002',
                          firstName: 'Marie',
                          lastName: 'Curie'
                        },
                        Int32: {
                          age: 30
                        },
                        Boolean: {
                          havingFun: true
                        },
                        Float64: {
                          distanceToUranus: 1.2345e67
                        }
                      }
                    }
                  }
                }
              },
              'map<example:extraterrestrial-1.0.0>': {
                extraterrestrials: {
                  insert: {
                    'example:extraterrestrial-1.0.0': {
                      '00000000-0000-0000-0000-000000000011': {
                        String: {
                          guid: '00000000-0000-0000-0000-000000000011',
                          name: 'E.T.'
                        },
                        Int64: {
                          age: [0xFFFFFFFF, 0xFFFFFFFF]
                        }
                      }
                    }
                  }
                }
              },
              'map<example:planet-1.0.0>': {
                planets: {
                  insert: {
                    'example:planet-1.0.0': {
                      '00000000-0000-0000-0000-000000000021': {
                        String: {
                          guid: '00000000-0000-0000-0000-000000000021',
                          name: 'Earth'
                        },
                        Uint64: {
                          age: [0xFFFFFFFF, 0xFFFFFFFF]
                        }
                      }
                    }
                  }
                }
              }
            },
            insertTemplates: {
              'example:person-1.0.0': {
                typeid: 'example:person-1.0.0',
                inherits: 'NamedNodeProperty',
                properties: [
                  { id: 'firstName', typeid: 'String' },
                  { id: 'lastName', typeid: 'String' },
                  { id: 'age', typeid: 'Int32' },
                  { id: 'havingFun', typeid: 'Boolean' },
                  { id: 'distanceToUranus', typeid: 'Float64' }
                ]
              },
              'example:extraterrestrial-1.0.0': {
                typeid: 'example:extraterrestrial-1.0.0',
                inherits: 'NamedNodeProperty',
                properties: [
                  { id: 'name', typeid: 'String' },
                  { id: 'age', typeid: 'Int64' }
                ]
              },
              'example:planet-1.0.0': {
                typeid: 'example:planet-1.0.0',
                inherits: 'NamedNodeProperty',
                properties: [
                  { id: 'name', typeid: 'String' },
                  { id: 'age', typeid: 'Uint64' }
                ]
              }
            }
          }
        });
      });

      it('should produce a new commit node for each index', async () => {
        for (let i = 0; i < indexNames.length; i++) {
          const firstCommit = await backend.get(`commitIndex#${branchGuid}#${indexNames[i]}:${firstCommitGuid}`);
          expect(firstCommit).to.exist;
        }
      });

      it('should update the head for each index', async () => {
        const branch = await mhService.getBranch(branchGuid);
        for (let i = 0; i < indexNames.length; i++) {
          expect(branch.indices[indexNames[i]].head).to.eql({
            guid: firstCommitGuid,
            sequence: 1
          });
        }
      });

      it('should produce the expected MV for each index', async () => {
        const mvExpectations = [
          createSingleColumnIndexMV([
            ['Albert', 'people[00000000-0000-0000-0000-000000000001]'],
            ['Marie', 'people[00000000-0000-0000-0000-000000000002]']
          ]),
          createSingleColumnIndexMV([
            ['50', 'people[00000000-0000-0000-0000-000000000001]'],
            ['30', 'people[00000000-0000-0000-0000-000000000002]'],
            [new Long(0xFFFFFFFF, 0xFFFFFFFF).toString(), 'extraterrestrials[00000000-0000-0000-0000-000000000011]'],
            [new Long(0xFFFFFFFF, 0xFFFFFFFF, true).toString(), 'planets[00000000-0000-0000-0000-000000000021]']
          ]),
          createSingleColumnIndexMV([
            ['false', 'people[00000000-0000-0000-0000-000000000001]'],
            ['true', 'people[00000000-0000-0000-0000-000000000002]']
          ]),
          createSingleColumnIndexMV([
            [(3.2e9).toString(), 'people[00000000-0000-0000-0000-000000000001]'],
            [(1.2345e67).toString(), 'people[00000000-0000-0000-0000-000000000002]']
          ])
        ];

        for (let i = 0; i < indexNames.length; i++) {
          const { changeSet } = await mhService.getIndexMV({
            branchGuid,
            commitGuid: firstCommitGuid,
            indexName: indexNames[i]
          });
          expect(changeSet).to.eql(mvExpectations[i]);
        }
      });
    });

    let secondCommitGuid;
    describe('when modifying data that matches the index include criteria', () => {
      before(async () => {
        secondCommitGuid = generateGUID();
        await mhService.createCommit({
          guid: secondCommitGuid,
          branchGuid,
          parentGuid: firstCommitGuid,
          changeSet: {
            modify: {
              'map<example:person-1.0.0>': {
                people: {
                  insert: {
                    'example:person-1.0.0': {
                      '00000000-0000-0000-0000-000000000003': {
                        String: {
                          guid: '00000000-0000-0000-0000-000000000003',
                          firstName: 'Leonardo',
                          lastName: 'da Vinci'
                        },
                        Int32: {
                          age: 61
                        },
                        Boolean: {
                          havingFun: true
                        },
                        Float64: {
                          distanceToUranus: 9.2782e-34
                        }
                      }
                    }
                  },
                  modify: {
                    'example:person-1.0.0': {
                      '00000000-0000-0000-0000-000000000002': {
                        String: {
                          firstName: 'Marie Skłodowska'
                        },
                        Int32: {
                          age: 31
                        },
                        Boolean: {
                          havingFun: false
                        },
                        Float64: {
                          distanceToUranus: 7.346e234
                        }
                      }
                    }
                  },
                  remove: [
                    '00000000-0000-0000-0000-000000000001'
                  ]
                }
              },
              'map<example:extraterrestrial-1.0.0>': {
                extraterrestrials: {
                  modify: {
                    'example:extraterrestrial-1.0.0': {
                      '00000000-0000-0000-0000-000000000011': {
                        Int64: {
                          age: [31, 0]
                        }
                      }
                    }
                  }
                }
              }
            },
            remove: ['planets']
          }
        });
      });

      it('should produce a new commit node for each index', async () => {
        for (let i = 0; i < indexNames.length; i++) {
          const secondCommit = await backend.get(`commitIndex#${branchGuid}#${indexNames[i]}:${secondCommitGuid}`);
          expect(secondCommit).to.exist;
        }
      });

      it('should update the head for each index', async () => {
        const branch = await mhService.getBranch(branchGuid);
        for (let i = 0; i < indexNames.length; i++) {
          expect(branch.indices[indexNames[i]].head).to.eql({
            guid: secondCommitGuid,
            sequence: 2
          });
        }
      });

      it('should produce the expected MV for each index', async () => {
        const mvExpectations = [
          createSingleColumnIndexMV([
            ['Marie Skłodowska', 'people[00000000-0000-0000-0000-000000000002]'],
            ['Leonardo', 'people[00000000-0000-0000-0000-000000000003]']
          ]),
          createSingleColumnIndexMV([
            ['31', [
              'people[00000000-0000-0000-0000-000000000002]',
              'extraterrestrials[00000000-0000-0000-0000-000000000011]'
            ]],
            ['61', 'people[00000000-0000-0000-0000-000000000003]']
          ]),
          createSingleColumnIndexMV([
            ['false', 'people[00000000-0000-0000-0000-000000000002]'],
            ['true', 'people[00000000-0000-0000-0000-000000000003]']
          ]),
          createSingleColumnIndexMV([
            [(7.346e234).toString(), 'people[00000000-0000-0000-0000-000000000002]'],
            [(9.2782e-34).toString(), 'people[00000000-0000-0000-0000-000000000003]']
          ])
        ];
        for (let i = 0; i < indexNames.length; i++) {
          const { changeSet } = await mhService.getIndexMV({
            branchGuid,
            commitGuid: secondCommitGuid,
            indexName: indexNames[i]
          });
          expect(changeSet).to.eql(mvExpectations[i]);
        }
      });
    });
  });

  describe('when validating index definition', () => {
    let branchGuid, rootCommitGuid;
    before(() => {
      branchGuid = generateGUID();
      rootCommitGuid = generateGUID();
    });

    it('should require a field', () => {
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {
            noField: {
              fields: [],
              include: [ { schema: 'aSchema' } ]
            }
          }
        }
      };
      return expect(mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      })).to.be.eventually.rejectedWith('"fields" must contain at least 1 items').and
        .to.have.property('statusCode', 400);
    });

    it('should require name for a field', () => {
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {
            noFieldName: {
              fields: [ { name: '', typeId: 'Integer' } ],
              include: [ { schema: 'aSchema' } ]
            }
          }
        }
      };
      return expect(mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      })).to.be.eventually.rejectedWith('"name" is not allowed to be empty').and
        .to.have.property('statusCode', 400);
    });

    it('should validate the name for a field is an identifier', () => {
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {
            noFieldName: {
              fields: [ { name: '1notAnIdentifier', typeId: 'Integer' } ],
              include: [ { schema: 'aSchema' } ]
            }
          }
        }
      };
      return expect(mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      })).to.be.eventually.rejectedWith('"name" with value "1notAnIdentifier" fails to match the required pattern: ' +
        '/^[a-zA-Z_][a-zA-Z0-9_]*$/').and
        .to.have.property('statusCode', 400);
    });

    it('should require type id for a field', () => {
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {
            noFieldTypeId: {
              fields: [ { name: 'aName' } ],
              include: [ { schema: 'aSchema' } ]
            }
          }
        }
      };
      return expect(mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      })).to.be.eventually.rejectedWith('"typeId" is required').and
        .to.have.property('statusCode', 400);
    });

    it('should not allow unsupported type ids', () => {
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {
            invalidFieldTypeId: {
              fields: [ { name: 'aName', typeId: 'Float64' } ],
              include: [ { schema: 'aSchema' } ]
            }
          }
        }
      };
      return expect(mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      })).to.be.eventually.rejectedWith('"typeId" must be one of [Path, String, Integer, Boolean, Single, Double]').and
        .to.have.property('statusCode', 400);
    });

    it('should require an include criteria', () => {
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {
            noInclude: {
              fields: [ { name: 'aName', typeId: 'Integer' } ],
              include: []
            }
          }
        }
      };
      return expect(mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      })).to.be.eventually.rejectedWith('"include" must contain at least 1 items').and
        .to.have.property('statusCode', 400);
    });

    // For now
    it('should require a schema in an include criteria', () => {
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {
            noInclude: {
              fields: [ { name: 'aName', typeId: 'Integer' } ],
              include: [ { schema: '' } ]
            }
          }
        }
      };
      return expect(mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      })).to.be.eventually.rejectedWith('"schema" is not allowed to be empty').and
        .to.have.property('statusCode', 400);
    });
  });

  describe('when ingesting change sets with string OTs and arrays', () => {
    let branchGuid, rootCommitGuid, indexName, indexDef;
    before(() => {
      branchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      indexName = 'text';
      indexDef = {
        fields: [
          { typeId: 'String', name: 'text' }
        ],
        include: [
          { schema: 'NodeProperty' }
        ]
      };
      const meta = {
        materializedHistory: {
          enabled: true,
          indices: {}
        }
      };
      meta.materializedHistory.indices[indexName] = indexDef;
      return mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      });
    });

    let firstCommitGuid;
    before(async () => {
      firstCommitGuid = generateGUID();
      await mhService.createCommit({
        guid: firstCommitGuid,
        branchGuid,
        parentGuid: rootCommitGuid,
        changeSet: {
          insert: {
            'array<NodeProperty>': {
              notIndexedTest: {
                insert: [
                  [0, [{
                    typeid: 'NodeProperty',
                    insert: {
                      String: {
                        text: 'Goodbye'
                      }
                    }
                  }]]
                ]
              }
            },
            NodeProperty: {
              insertTest: {
                insert: {
                  String: {
                    text: 'Hello world!'
                  }
                }
              },
              modifyTest: {
                insert: {
                  String: {
                    text: 'Hello world!'
                  }
                }
              },
              removeTest: {
                insert: {
                  String: {
                    text: 'Hello world!'
                  }
                }
              },
              multipleTest: {
                insert: {
                  String: {
                    text: 'Hello world!'
                  }
                }
              }
            }
          }
        }
      });
    });

    let secondCommitGuid;
    before(async () => {
      secondCommitGuid = generateGUID();
      await mhService.createCommit({
        guid: secondCommitGuid,
        branchGuid,
        parentGuid: firstCommitGuid,
        changeSet: {
          modify: {
            'array<NodeProperty>': {
              notIndexedTest: {
                modify: [
                  [0, [{
                    typeid: 'NodeProperty',
                    modify: {
                      String: {
                        text: 'Say goodbye'
                      }
                    }
                  }]]
                ]
              }
            },
            NodeProperty: {
              insertTest: {
                modify: {
                  String: {
                    text: {
                      insert: [ [6, 'beautiful '] ]
                    }
                  }
                }
              },
              modifyTest: {
                modify: {
                  String: {
                    text: {
                      modify: [ [6, 'Martin'] ]
                    }
                  }
                }
              },
              removeTest: {
                modify: {
                  String: {
                    text: {
                      remove: [ [5, 6] ]
                    }
                  }
                }
              },
              multipleTest: {
                modify: {
                  String: {
                    text: {
                      insert: [ [0, 'Say '] ],
                      modify: [ [0, 'h'] ],
                      remove: [ [5, 6] ]
                    }
                  }
                }
              }
            }
          }
        }
      });
    });

    it('should update the index with the transformed string values and exclude array items', async () => {
      const mvExpectation = createSingleColumnIndexMV([
        ['Hello beautiful world!', 'insertTest'],
        ['Hello Martin', 'modifyTest'],
        ['Hello!', 'removeTest'],
        ['Say hello!', 'multipleTest']
      ]);
      const { changeSet } = await mhService.getIndexMV({
        branchGuid,
        commitGuid: secondCommitGuid,
        indexName: indexName
      });
      expect(changeSet).to.eql(mvExpectation);
    });
  });

  describe('when branching', () => {
    let branchGuid, rootCommitGuid, meta, indexName, indexDef;
    before(() => {
      branchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      indexName = 'text';
      indexDef = {
        fields: [
          { typeId: 'String', name: 'text' }
        ],
        include: [
          { schema: 'NodeProperty' }
        ]
      };
      meta = {
        materializedHistory: {
          enabled: true,
          indices: {}
        }
      };
      meta.materializedHistory.indices[indexName] = indexDef;
      return mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta
      });
    });

    let firstCommitGuid, firstSample, secondBranchGuid;
    before(async () => {
      firstCommitGuid = generateGUID();
      const firstProperties = {};
      for (let i = 0; i < 1000; i++) {
        firstProperties[`property${i}`] = {
          insert: {
            String: {
              text: generateGUID()
            }
          }
        };
      }
      firstSample = firstProperties['property500'].insert.String.text;
      await mhService.createCommit({
        guid: firstCommitGuid,
        branchGuid,
        parentGuid: rootCommitGuid,
        changeSet: {
          insert: {
            NodeProperty: firstProperties
          }
        }
      });
      secondBranchGuid = generateGUID();
      await mhService.createBranch({
        guid: secondBranchGuid,
        meta,
        rootCommitGuid: firstCommitGuid,
        parentBranchGuid: branchGuid
      });
    });

    let branchCommitGuid, branchSample;
    before(async () => {
      branchCommitGuid = generateGUID();
      const branchProperties = {};
      for (let i = 1000; i < 2000; i++) {
        branchProperties[`property${i}`] = {
          insert: {
            String: {
              text: generateGUID()
            }
          }
        };
      }
      branchSample = branchProperties['property1500'].insert.String.text;
      await mhService.createCommit({
        guid: branchCommitGuid,
        branchGuid: secondBranchGuid,
        parentGuid: firstCommitGuid,
        changeSet: {
          insert: {
            NodeProperty: branchProperties
          }
        }
      });
    });

    let secondCommitGuid, secondSample;
    before(async () => {
      secondCommitGuid = generateGUID();
      const secondProperties = {};
      for (let i = 1000; i < 2000; i++) {
        secondProperties[`property${i}`] = {
          insert: {
            String: {
              text: generateGUID()
            }
          }
        };
      }
      secondSample = secondProperties['property1500'].insert.String.text;
      await mhService.createCommit({
        guid: secondCommitGuid,
        branchGuid,
        parentGuid: firstCommitGuid,
        changeSet: {
          insert: {
            NodeProperty: secondProperties
          }
        }
      });
    });

    it('should be possible to get the index MV of both the original and the new branch', async () => {
      const { changeSet: firstBranchResult } = await mhService.getIndexMV({
        branchGuid,
        commitGuid: secondCommitGuid,
        indexName,
        filtering: {
          values: [[firstSample], [branchSample], [secondSample]]
        }
      });
      expect(firstBranchResult).to.eql(createSingleColumnIndexMV([
        [firstSample, 'property500'],
        [secondSample, 'property1500']
      ]));

      const { changeSet: secondBranchResult } = await mhService.getIndexMV({
        branchGuid: secondBranchGuid,
        commitGuid: branchCommitGuid,
        indexName,
        filtering: {
          values: [[firstSample], [branchSample], [secondSample]]
        }
      });
      expect(secondBranchResult).to.eql(createSingleColumnIndexMV([
        [firstSample, 'property500'],
        [branchSample, 'property1500']
      ]));
    });
  });
});
