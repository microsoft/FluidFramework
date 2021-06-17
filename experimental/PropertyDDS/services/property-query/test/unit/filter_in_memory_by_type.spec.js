/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const InMemoryByType =
  require('../../src/materialized_history_service/query_pipeline/filtering/in_memory_by_type');

describe('In-Memory filtering by type', () => {

  const theChangeSet = {
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
  };

  it('should return a changeSet filtered by type', () =>
    expect(InMemoryByType.filterByType({
      typeId: 'mysample:point2d-1.0.0',
      depthLimit: Infinity,
      pathPrefix: ''
    }, theChangeSet))
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
