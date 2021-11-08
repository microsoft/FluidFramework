/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const QueryV1Execution = require('../../src/materialized_history_service/query_pipeline/query_v1_execution');
const sinon = require('sinon');

describe('Query V1 execution', () => {

  const mockMaterializedHistoryService = {
    getCommitMV: () => { throw new Error('One shall not hit the unstubbed');}
  };

  const getCommitMVStub = sinon.stub(mockMaterializedHistoryService, 'getCommitMV');

  const aQV1Execution = new QueryV1Execution({
    materializedHistoryService: mockMaterializedHistoryService
  });

  const someBranchInfo = {
    guid: generateGUID(),
    meta: {},
    rootCommitGuid: generateGUID(),
    headCommitGuid: generateGUID(),
    headSequenceNumber: 50,
    created: new Date().toISOString()
  };

  const someCommitGuid = generateGUID();

  describe('without a from query member', () => {
    it('should reject', () =>
      expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, {
        paging: {
          order: [{
            by: 'info.dateCreated',
            direction: 'DESC'
          }],
          limit: 3,
          offset: 5
        }
      })).to.be.eventually.rejectedWith('"from" is required')
        .and.to.have.property('statusCode', 400)
    );
  });

  describe('with a from query member', () => {
    let resultFromMHS = {
      changeSet: {
        insert: {
          String: {
            a: 'value'
          }
        }
      }
    };

    let theQuery = {
      from: [{
        pathPrefix: 'a'
      }],
      queryLanguage: 'queryV1'
    };

    before(() => {
      getCommitMVStub
        .withArgs({
          guid: someCommitGuid,
          paths: [ theQuery.from[0].pathPrefix ],
          branchGuid: someBranchInfo.guid
        })
        .resolves(resultFromMHS);
    });

    it('should return the result from materializedHistoryService as-is', () =>
      expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, theQuery))
        .to.eventually.eql(resultFromMHS)
    );

    it('should pass the from.pathPrefix as a subtree checkout path', () =>
      expect(getCommitMVStub.callCount).to.eql(1)
    );

    after(() => {
      getCommitMVStub.restore();
    });

    describe('with a typeId, but no paging member', () => {
      let pagedQuery = {
        queryLanguage: 'queryV1',
        from: [{
          pathPrefix: '',
          depthLimit: -1,
          typeId: 'mysample:point2d-1.0.0'
        }]
      };

      let pageableResult = {
        changeSet: {
          insert: {
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
            },
            NodeProperty: {
              aNodeProperty: {
                insert: {
                  String: {
                    a: 'someString'
                  }
                }
              }
            }
          }
        }
      };

      before(() => {
        getCommitMVStub
          .withArgs({
            guid: someCommitGuid,
            paths: [],
            branchGuid: someBranchInfo.guid
          })
          .resolves(pageableResult);
      });

      it('should return the result filtered by type', () =>
        expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, pagedQuery))
        .to.eventually.eql({
          changeSet: {
            insert: {
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
          },
          queryPaths: [
            'myPointsMap[pointF]',
            'myPointsMap[pointG]',
            'myPointsMap[pointH]',
            'myPointsMap[pointI]',
            'myPointsMap[pointJ]'
          ]
        })
      );
    });

    describe('paging without a typeId passed', () => {
      let pagedQuery = {
        queryLanguage: 'queryV1',
        from: [{
          pathPrefix: 'myPointsMap'
        }],
        paging: {
          order: [{
            by: 'x',
            direction: 'ASC'
          }],
          limit: 2,
          offset: 1
        }
      };

      before(() => {
        getCommitMVStub
          .withArgs({
            guid: someCommitGuid,
            paths: [ pagedQuery.from[0].pathPrefix ],
            branchGuid: someBranchInfo.guid
          })
          .resolves({});
      });

      it('should throw', () =>
        expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, pagedQuery))
        .to.be.eventually.rejectedWith('from.typeId required when paging')
        .and.to.have.property('statusCode', 400)
      );
    });

    describe('paging with multiple orders but not all of them having by', () => {
      let pagedQuery = {
        queryLanguage: 'queryV1',
        from: [{
          pathPrefix: 'myPointsMap',
          typeId: 'mysample:point2d-1.0.0'
        }],
        paging: {
          order: [{
            by: 'x',
            direction: 'ASC'
          }, {
            direction: 'ASC'
          }],
          limit: 2,
          offset: 1
        }
      };

      before(() => {
        getCommitMVStub
          .withArgs({
            guid: someCommitGuid,
            paths: [ pagedQuery.from[0].pathPrefix ],
            branchGuid: someBranchInfo.guid
          })
          .resolves({});
      });

      it('should throw', () =>
        expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, pagedQuery))
        .to.be.eventually.rejectedWith('Only a single ordering criteria is allowed when ordering by key')
        .and.to.have.property('statusCode', 400)
      );
    });

    describe('paging with a native typeId passed', () => {
      let pagedQuery = {
        queryLanguage: 'queryV1',
        from: [{
          pathPrefix: 'myPointsMap',
          typeId: 'Int32'
        }],
        paging: {
          order: [{
            by: 'x',
            direction: 'ASC'
          }],
          limit: 2,
          offset: 1
        }
      };

      before(() => {
        getCommitMVStub
          .withArgs({
            guid: someCommitGuid,
            paths: [ pagedQuery.from[0].pathPrefix ],
            branchGuid: someBranchInfo.guid
          })
          .resolves({});
      });

      it('should throw', () =>
        expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, pagedQuery))
        .to.be.eventually.rejectedWith('from.typeId must not be a primitive type')
        .and.to.have.property('statusCode', 400)
      );
    });

    describe('with a properly formatted paging member', () => {
      let pagedQuery = {
        queryLanguage: 'queryV1',
        from: [{
          pathPrefix: 'myPointsMap',
          typeId: 'mysample:point2d-1.0.0'
        }],
        paging: {
          order: [{
            by: 'x',
            direction: 'ASC'
          }],
          limit: 2,
          offset: 1
        }
      };

      let pageableResult = {
        changeSet: {
          insert: {
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
        }
      };

      before(() => {
        getCommitMVStub
          .withArgs({
            guid: someCommitGuid,
            paths: [ pagedQuery.from[0].pathPrefix ],
            branchGuid: someBranchInfo.guid
          })
          .resolves(pageableResult);
      });

      it('should return the result paged', () =>
        expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, pagedQuery))
        .to.eventually.eql({
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
                      pointG: {
                        Float64: {
                          x: -8,
                          y: -16
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          queryPaths: [
            'myPointsMap.pointG',
            'myPointsMap.pointH'
          ]
        })
      );
    });
  });
});
