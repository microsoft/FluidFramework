/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals PropertyFactory */
/* eslint no-unused-expressions: 0 */

const { chunkChangeSet, convertPathToChunkBoundaryFormat, getPathFromChunkBoundaryFormat } =
  require('../../../src/materialized_history_service/change_set_processing/chunk_change_set');
const { mergeChunkedChangeSet }     =
  require('../../../src/materialized_history_service/change_set_processing/merge_chunked_changeset');
const Utils                         = require('@fluid-experimental/property-changeset').Utils;
const ChangeSet                     = require('@fluid-experimental/property-changeset').ChangeSet;
const _                             = require('lodash');
const TypeIdHelper                  = require('@fluid-experimental/property-changeset').TypeIdHelper;
const DeterministicRandomGenerator  = require('@fluid-experimental/property-common').DeterministicRandomGenerator;
const generateDeterministicGuid     = require('./test_utils').generateDeterministicGuid;

describe('chunkChangeSet', function() {
  let deterministicRandom;

  before(() => {
    PropertyFactory._reregister({
      typeid: 'adsk.test:mixedTemplate-1.0.0',
      inherits: ['NodeProperty', 'NamedProperty'],
      properties: [
        { id: 'string1', typeid: 'String', 'default': 'abcdefghijkl' },
        { id: 'nested', properties: [
          {id: 'string', typeid: 'String', 'default': 'abcdefghijkl2' }
        ] },
        { id: 'subProperty', typeid: 'adsk.test:subTemplate-1.0.0' }
      ]
    });

    PropertyFactory._reregister({
      typeid: 'adsk.test:subTemplate-1.0.0',
      inherits: 'NodeProperty',
      properties: [
        { id: 'string1',      typeid: 'String', 'default': 'testString' },
        { id: 'string_array', typeid: 'String', context: 'array', 'default': ['string1', 'string2', 'string3'] },
        { id: 'string_map',   typeid: 'String', context: 'map', 'default': {'key1': 'value1', 'key2': 'value'} }
      ]
    });
  });
  beforeEach(() => {
    deterministicRandom = new DeterministicRandomGenerator('fcfaa9c7-8483-85ca-04ee-c20458f86532');
  });

  /**
   * Creates a property tree with multiple nested mixedTemplate objects
   *
   * @param {HFDM.Property.NodeProperty} [in_root]  - The root property of the tree
   * @param {Number}                     [in_count] - The number of properties to add
   *
   * @return {HFDM.Property.NodeProperty} The generated NodeProperty
   */
  let createSimpleTestProperty = function(in_root = PropertyFactory.create('NodeProperty'), in_count = 10) {
    for (let i = 0; i < in_count; i++) {
      let entry = PropertyFactory.create('adsk.test:mixedTemplate-1.0.0');
      entry.get('guid').setValue(generateDeterministicGuid(deterministicRandom));
      for (let j = 0; j < 3; j++) {
        let subEntry = PropertyFactory.create('adsk.test:mixedTemplate-1.0.0');
        subEntry.get('guid').setValue(generateDeterministicGuid(deterministicRandom));
        entry.insert(subEntry.getId(), subEntry);
      }
      for (let j = 0; j < 3; j++) {
        let subEntry = PropertyFactory.create('adsk.test:mixedTemplate-1.0.0');
        subEntry.get('guid').setValue(generateDeterministicGuid(deterministicRandom));
        entry.get('subProperty').insert(subEntry.getId(), subEntry);
      }
      in_root.insert(entry.getId(), entry);
    }
    return in_root;
  };

  /**
   * Modifies an existing test property tree.
   * This will create insert, modify and remove operations.
   *
   * @param {HFDM.Property.NodeProperty} [in_root]  - The root property of the tree
   *
   * @return {HFDM.Property.NodeProperty} The modified NodeProperty
   */
  let modifySimpleTestProperty = function(in_root) {
    let ids = in_root.getIds();
    for (let i = 0; i < ids.length; i++) {
      let id = ids[i];
      let entry = in_root.get(id);

      if (i % 3 === 0) {
        in_root.remove(id);
      } else if (i % 2 === 0) {
        // Insert some nested properties
        for (let j = 0; j < 3; j++) {
          let subEntry = PropertyFactory.create('adsk.test:mixedTemplate-1.0.0');
          subEntry.get('guid').setValue(generateDeterministicGuid(deterministicRandom));
          entry.get('subProperty').insert(subEntry.getId(), subEntry);
        }
      } else {
        // Modify some strings
        entry.get('string1').setValue('+' + entry.get('string1').getValue() + '+');
        entry.get(['nested', 'string']).setValue('+' + entry.get(['nested', 'string']).getValue() + '+');
        entry.get(['subProperty', 'string1']).setValue('+' + entry.get(['subProperty', 'string1']).getValue() + '+');
      }
    }

    // Insert a few new elements at the root
    createSimpleTestProperty(in_root, 3);

    return in_root;
  };

  let testChangeSetChunking = function(in_changeSet, in_chunks, in_chunkSize, in_testFirstPath) {
    // Make sure the remove operations are sorted
    if (in_changeSet.remove) {
      in_changeSet.remove.sort();
    }

    // Validate the chunks
    for (let i = 0; i < in_chunks.length; i++) {
      let chunk = in_chunks[i];

      // The size of chunk should match the serialized JSON
      if (in_chunkSize !== undefined) {
        expect(JSON.stringify(chunk.changeSet).length).to.equal(chunk.size);
      }

      // The first path should actually exist in the chunk
      if (chunk !== in_chunks[0] && in_testFirstPath) {
        let path = chunk.startPath.substr(0, chunk.startPath.length - 1);
        path = path.replace(/\x00/g, '.');
        let firstPathChangeset = Utils.getChangesByPath(path, null, chunk.changeSet);
        expect(firstPathChangeset.insert).to.exist;
      }

      // Make sure all paths in the chunk are in between the boundaries
      Utils.traverseChangeSetRecursively(chunk.changeSet, {
        postCallback: (context) => {
          let typeID = context.getTypeid();
          // We only test leafs, which are not remove operations
          if ((!TypeIdHelper.isPrimitiveType(typeID) &&
              !_.isEmpty(context.getNestedChangeSet())) ||
              context.getOperationType() === 'remove') {
            return;
          }

          let path = context.getFullPath() + '.';
          if (chunk.startPath !== undefined) {
            expect(path >= chunk.startPath, `Expected '${path}' to be at least '${chunk.startPath}'`);
          }
          if (i < in_chunks.length - 1) {
            let endPath = in_chunks[i + 1].startPath;
            const contextPath = convertPathToChunkBoundaryFormat(context.getFullPath());
            expect(contextPath < endPath, `Expected '${contextPath}' to be below '${endPath}'`);
          }
        }
      });

      // We only test the chunk size for chunks of a larger size,
      // since very small chunks sometimes have to be bigger than the
      // minimum size to include even one property
      if (in_chunkSize > 512) {
        expect(chunk.size).to.be.at.most(in_chunkSize);
      }
    }

    // Merging the chunks should give back the original changeSet
    let mergedCS = mergeChunkedChangeSet(in_chunks.map((x) => x.changeSet));
    expect(mergedCS).to.deep.equal(in_changeSet);
  };

  describe('should support chunking an insert CS', () => {
    for (let size of [256, 1024]) {
      it('into ' + size + ' bytes chunks', function() {
        let property = createSimpleTestProperty();
        let CS = property.serialize();

        // Create chunks for the changeset
        let chunks = chunkChangeSet(CS, size);

        testChangeSetChunking(CS, chunks, size, true);
      });
    }
  });

  describe('should support chunking a modification CS', () => {
    for (let size of [256, 1024]) {
      it('into ' + size + ' bytes chunks', function() {
        let property = createSimpleTestProperty();
        modifySimpleTestProperty(property);

        let CS = property.serialize({dirtyOnly: true});

        // Create chunks for the changeset
        let chunks = chunkChangeSet(CS, size);

        testChangeSetChunking(CS, chunks, size, true);
      });
    }
  });

  describe('should support chunking a modification CS on path boundaries', () => {
    let testChangeSetModification = function(in_createCallback, in_modifyCallbacks, in_chunkSize) {
      let property = in_createCallback();
      let CS1 = property.serialize();

      // Create chunks for the initial changeset
      let chunks = chunkChangeSet(CS1, in_chunkSize);

      for (let callback of in_modifyCallbacks) {
        property.cleanDirty();

        // Now perform a modification of the initial changeset
        callback(property);
        let CS2 = property.serialize({dirtyOnly: true});

        // And chunk it along the boundary paths we got from the
        // first chunking operation
        let chunks2 = chunkChangeSet(CS2, undefined, chunks.slice(1).map((x) => x.startPath));

        // Make sure the chunks are valid
        testChangeSetChunking(CS2, chunks2, undefined, false);

        // Check whether they can be applied to the original chunks and then give the correct CS
        // This also includes validating that delta calculation is possible
        for (let chunk of chunks2) {
          let newChangeSet = new ChangeSet(chunks[chunk.correspondingChunkIndex].changeSet);
          let deltaCS = new ChangeSet(chunk.changeSet);
          deltaCS._toReversibleChangeSet(newChangeSet.getSerializedChangeSet());
          newChangeSet.applyChangeSet(chunk.changeSet);
        }
        let mergedCS = mergeChunkedChangeSet(chunks.map((x) => x.changeSet));
        delete mergedCS.modify;
        delete mergedCS.remove;

        new ChangeSet(CS1).applyChangeSet(CS2);
        expect(mergedCS).to.deep.equal(CS1);
      }
    };

    describe('with mixed modifications', () => {
      for (let size of [256, 1024]) {
        it('into ' + size + ' bytes chunks', function() {
          testChangeSetModification(createSimpleTestProperty, [modifySimpleTestProperty], size);
        });
      }
    });

    describe('with sequential removes', () => {
      for (let size of [256, 1024]) {
        it('into ' + size + ' bytes chunks', function() {
          testChangeSetModification(() => {
            let result = PropertyFactory.create('NodeProperty');
            for (let i = 10; i < 90; i++) {
              result.insert(String(i), PropertyFactory.create('adsk.test:subTemplate-1.0.0'));
            }
            return result;
          }, _.range(10, 90, 10).map((j) => function(root) {
            for (let k = j; k < j + 10; k++) {
              root.remove(String(k));
            }
          }), size);
        });
      }
    });

    it('with static properties', () => {
      let root, myProperty, subProperty;
      const create = () => {
        root = PropertyFactory.create('NodeProperty');
        myProperty = PropertyFactory.create('adsk.test:mixedTemplate-1.0.0');
        myProperty.insert('aString', PropertyFactory.create('String', 'single', 'i'.repeat(10)));
        root.insert('myProperty', myProperty);
        myProperty.get('string1').setValue('i'.repeat(50));
        subProperty = myProperty.get('subProperty');
        subProperty.insert('zDynamicString', PropertyFactory.create('String', 'single', 'i'.repeat(50)));
        return root;
      };

      const modify = () => {
        myProperty.get('aString').setValue('m'.repeat(10));
        subProperty.get('zDynamicString').setValue('m'.repeat(50));
        return root;
      };

      testChangeSetModification(create, [modify], 256);
    });
  });

  describe('chunking removes on boundaries should work', () => {
    it('for a single boundary', () => {
      let chunks = chunkChangeSet({ remove: [ 'test1' ] }, undefined, [ 'test1\x00subProperty\x00' ] );
      expect(chunks.length).to.equal(2);
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].correspondingChunkIndex).to.equal(i);
        expect(chunks[i].changeSet).to.deep.equal({remove: [ 'test1' ]});
      }
    });
    it('for two boundaries', () => {
      let chunks = chunkChangeSet({ remove: [ 'test1' ] }, undefined, [ 'test0\x00subProperty\x00',
        'test1\x00subProperty\x00' ] );
      expect(chunks.length).to.equal(2);
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].correspondingChunkIndex).to.equal(i + 1);
        expect(chunks[i].changeSet).to.deep.equal({remove: [ 'test1' ]});
      }
    });
    it('for a remove between boundaries', () => {
      let chunks = chunkChangeSet({ remove: [ 'test1' ] }, undefined, [ 'test0\x00subProperty\x00',
        'test2\x00subProperty\x00' ] );
      expect(chunks.length).to.equal(1);
      expect(chunks[0].correspondingChunkIndex).to.equal(1);
      expect(chunks[0].changeSet).to.deep.equal({remove: [ 'test1' ]});
    });
  });

  describe('chunking inserts on boundaries should work', () => {
    let CS, CS2;
    before(() => {
      CS = {
        insert: {
          'adsk.test:subTemplate-1.0.0': {
            'test1': {
              'String': {
                'a': '',
                'b': ''
              }
            }
          }
        }
      };

      CS2 = {
        'map<autodesk.test:type1-1.0.0>': {
          'test': {
            'insert': {
              'autodesk.test:type1-1.0.0': {
                '1': {
                  'String': {
                    'name': '1'
                  }
                },
                '3': {
                  'String': {
                    'name': '3'
                  }
                }
              }
            }
          }
        }
      };
    });

    it('for a single boundary at the first child', () => {
      let chunks = chunkChangeSet(CS, undefined, [ 'test1\x00a\x00' ] );
      expect(chunks.length).to.equal(2);
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].correspondingChunkIndex).to.equal(i);
      }
      expect(chunks[0].changeSet).to.deep.equal({
        insert: {
          'adsk.test:subTemplate-1.0.0': {
            'test1': {}
          }
        }
      });
      expect(chunks[1].changeSet).to.deep.equal(CS);
    });

    it('for a single boundary at the parent', () => {
      let chunks = chunkChangeSet(CS, undefined, [ 'test1\x00' ] );
      expect(chunks.length).to.equal(1);
      expect(chunks[0].correspondingChunkIndex).to.equal(1);
      expect(chunks[0].changeSet).to.deep.equal(CS);
    });

    it('for a single boundary after the property', () => {
      let chunks = chunkChangeSet(CS, undefined, [ 'test2\x00' ] );
      expect(chunks.length).to.equal(1);

      expect(chunks[0].correspondingChunkIndex).to.equal(0);
      expect(chunks[0].changeSet).to.deep.equal(CS);
    });

    it('for a single boundary before the property', () => {
      let chunks = chunkChangeSet(CS, undefined, [ 'test0\x00' ] );
      expect(chunks.length).to.equal(1);

      expect(chunks[0].correspondingChunkIndex).to.equal(1);
      expect(chunks[0].changeSet).to.deep.equal(CS);
    });

    it('for maps', () => {
      let chunks = chunkChangeSet(CS2, undefined, [ 'test\x002\x00' ] );
      expect(chunks.length).to.equal(2);
      expect(chunks[0].changeSet).to.deep.equal({
        'map<autodesk.test:type1-1.0.0>': {
          'test': {
            'insert': {
              'autodesk.test:type1-1.0.0': {
                '1': {
                  'String': {
                    'name': '1'
                  }
                }
              }
            }
          }
        }
      });
      expect(chunks[1].changeSet).to.deep.equal({
        'map<autodesk.test:type1-1.0.0>': {
          'test': {
            'insert': {
              'autodesk.test:type1-1.0.0': {
                '3': {
                  'String': {
                    'name': '3'
                  }
                }
              }
            }
          }
        }
      });
    });

    it('for maps with multiple boundaries', () => {
      let chunks = chunkChangeSet(CS2, undefined,
        [ 'test\x002\x001\x00', 'test\x002\x002\x00', 'test\x002\x003\x00' ] );
      expect(chunks.length).to.equal(2);
      expect(chunks[0].correspondingChunkIndex).to.equal(0);
      expect(chunks[1].correspondingChunkIndex).to.equal(3);
    });

    it('for maps with overlapping remove boundaries', () => {
      let chunks = chunkChangeSet({'map<autodesk.test:type1-1.0.0>': {'test': {'remove': ['2']}}}, undefined,
        ['test\x002\x00abcd\x00', 'test\x0021\x00', 'test\x0022\x00', 'test\x003\x00'] );
      expect(chunks.length).to.equal(2);
      expect(chunks[0].correspondingChunkIndex).to.equal(0);
      expect(chunks[1].correspondingChunkIndex).to.equal(1);
    });
  });

  describe('should properly handle collection types that are not chunkable', () => {
    const size = 256;

    it('for primitive maps', () => {
      const CS = {
        'insert': {
          'map<String>': {
            'largePrimitiveMap': {
              'insert': _.fromPairs(_.times(1000, (n) => [n, n]))
            }
          }
        }
      };

      const chunks = chunkChangeSet(CS, size);
      testChangeSetChunking(CS, chunks, size, true);
      expect(chunks.length).to.equal(1);
    });

    it('for primitive arrays', () => {
      const CS = {
        'insert': {
          'array<String>': {
            'largePrimitiveArray': {
              'insert': [[0, _.times(1000, (n) => n.toString())]]
            }
          }
        }
      };

      const chunks = chunkChangeSet(CS, size);
      testChangeSetChunking(CS, chunks, size, true);
      expect(chunks.length).to.equal(1);
    });

    it('for non primitive arrays', () => {
      const CS = {
        'insert': {
          'array<mysample:point2d-1.0.0>': {
            'largeArray': {
              'insert': [[0, _.times(1000, (n) => {
                return {
                  'typeid': 'mysample:point2d-1.0.0',
                  'x': n,
                  'y': n
                };
              })]]
            }
          }
        }
      };

      const chunks = chunkChangeSet(CS, size);
      testChangeSetChunking(CS, chunks, size, true);
      expect(chunks.length).to.equal(1);
    });
  });

  describe('escaping and unescaping paths', () => {
    let cases = [
      'aaaa.bbbbb.ccccc', 'aaa\x00.bb.cccc', 'aaaa\x01\x00.bb.cccc',
      '\x01aaaa.bbbbb.ccccc', '\x00aaa.bb.cccc', 'aaaa\x01.12.cccc',
      '\x01\x01', '\x00\x00\x00', '1.2.3\x00', 'aaaa\x01\x01.12.cccc',
      '𐎦おѨ\x01\x01.12.cccc'
    ];

    cases.forEach((c) => {
      it(`should escape and unescape a path properly ${encodeURI(c)}`, () => {
        let result = convertPathToChunkBoundaryFormat(c);
        let backResult = getPathFromChunkBoundaryFormat(result);
        expect(backResult).to.eql(c);
      });
    });
  });

  describe('for changeSet with an empty changeset at the end of the tree', () => {
    const changeSet = {
      'modify': {
        'test.data:thing.collection-1.0.0': {
          'ThingCollection': {
            'map<test.data:thing-1.0.0>': {
              'things': {
                'modify': {
                  'test.data:stuff.graph-1.0.0': {
                    'aabb74af-29b7-a8e6-1513-6d9a13d86e6b': {
                      'map<test.data:stuff-1.0.0>': {
                        'stuffs': {
                          'modify': {
                            'test.product:stuffs.model-0.0.2': {
                              '888f9944-b7b2-2038-2d19-07577129808f': {
                                'test.product:components.ABCReference-0.0.1': {
                                  'abcReference': {

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
    };

    it('should assign the changeSet to the right chunk', () => {
      const chunks = chunkChangeSet(changeSet, undefined, [
        'ThingCollection\u0000things\u000041eabec4-1deb-0795-02b5-62880095c7b0' +
          '\u0000stuffs\u0000043bed9a-d3b7-2da1-ed9d-aa91a5b184f6\u0000guid\u0000',
        'ThingCollection\u0000things\u00007c9fa8f0-c594-24bb-8ddd-f5692b53bd1e' +
          '\u0000stuffs\u00008b83780a-61ca-7841-571a-4d47d8f7dba4\u0000relationships' +
          '\u0000793e54f6-3111-de3c-da99-f4ccd194a899\u0000guid\u0000',
        'ThingCollection\u0000things\u0000ce15edd2-3b4d-0e3c-a97f-7f9bc23a5ec3' +
          '\u0000stuffs\u0000e0264ca0-cd12-6a2e-6bac-e5beb8205c19\u0000product' +
          '\u0000manufacturer\u0000'
      ]);
      expect(chunks.length).to.eql(1);
      expect(chunks[0].correspondingChunkIndex).to.eql(2);
    });
  });

  describe('when a node is split', () => {
    const changeSet = {
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

    it('the start path for the produced chunk should point to the first property, leaf or not', () => {
      const chunks = chunkChangeSet(changeSet, 69, undefined);
      expect(chunks.length).to.eql(2);
      expect(chunks[1].startPath).to.eql('b\x00');
    });
  });

  describe('when property ids contain escaped characters', () => {
    const changeSet = {
      insert: {
        String: {
          '\x00': '0',
          '\x01': '1'
        }
      }
    };

    it('chunks should keep the keys unchanged', () => {
      const chunks = chunkChangeSet(changeSet, 16, undefined);
      expect(chunks.length).to.eql(2);
      expect(chunks[0].changeSet).to.eql({
        insert: {
          String: {
            '\x00': '0'
          }
        }
      });
      expect(chunks[1].changeSet).to.eql({
        insert: {
          String: {
            '\x01': '1'
          }
        }
      });
    });
  });

  describe('chunking of inserts and removes ', () => {
    let testReversibleChangeSetChunking = (operation, boundaries, expectedChunkCS, nestedType, nestedData) => {
      let operationName = operation;
      if (operation === 'reversible remove') {
        operationName = 'remove';
      }

      let CS;
      if (operation === 'remove') {
        CS = {
          [operationName]: ['data']
        };
      } else {
        CS = {
          [operationName]: {
            'NodeProperty': {
              'data': {
                'insert': {
                  [nestedType]: {
                    'bbb': nestedData,
                    'ddd': nestedData
                  }
                }
              }
            }
          }
        };
      }

      boundaries = boundaries.map((x) =>
         'data\u0000' + x + '\u0000'
      );

      let chunks = chunkChangeSet(CS, undefined, boundaries);
      expect(chunks.length).to.eql(expectedChunkCS.length);

      for (let i = 0; i < expectedChunkCS.length; i++) {
        if (operation === 'remove') {
          expect(chunks[i].changeSet).to.eql({
            [operationName]: ['data']
          });
        } else {
          expect(chunks[i].changeSet).to.eql({
            [operationName]: {
              'NodeProperty': {
                'data': expectedChunkCS[i] ? {
                  'insert': {
                    [nestedType]: expectedChunkCS[i]
                  }
                } : {}
              }
            }
          });
        }
      }
    };

    for (let [dataTypeDescription, type, dataCS] of [
      ['with primitives', 'String', 'test'],
      ['with NodeProperties', 'NodeProperty', {
        'insert': {
          'String': {
            'NestedData': 'Test'
          }
        }
      }]
    ]) {
      describe(dataTypeDescription, () => {
        for (let [operation, article] of [
            //['insert', 'an'],
            //['remove', 'a'],
            ['reversible remove', 'a']
        ]) {

          it('should correctly chunk ' + article + ' ' + operation + ' into multiple ' + operation + 's', () => {
            testReversibleChangeSetChunking(operation, ['ccc'],
              [
                {'bbb': dataCS},
                {'ddd': dataCS}
              ],
              type,
              dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation + ', leaving an empty initial ' + operation, () => {
            testReversibleChangeSetChunking(operation,
              ['aaa'],
              [
                undefined,
                {'bbb': dataCS, 'ddd': dataCS}
              ],
              type,
              dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation +
            ', leaving multiple empty initial ' + operation + 's', () => {
            testReversibleChangeSetChunking(operation,
              ['aaa', 'aaa1', 'aaa2'],
              [undefined, undefined, undefined, {'bbb': dataCS, 'ddd': dataCS}],
              type, dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation + ', leaving an empty final ' + operation, () => {
            testReversibleChangeSetChunking(operation,
              ['eee'],
              [
                {'bbb': dataCS, 'ddd': dataCS},
                undefined
              ],
              type,
              dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation +
            ', leaving multiple empty final ' + operation + 's', () => {
            testReversibleChangeSetChunking(operation,
              ['eee', 'fff', 'ggg'],
              [{'bbb': dataCS, 'ddd': dataCS}, undefined, undefined, undefined],
              type, dataCS
            );
          });
          it('should correctly create ' + operation + ' chunks for ranges in the middle', () => {
            testReversibleChangeSetChunking(operation,
              ['cc1', 'cc2', 'cc3'],
              [
                {'bbb': dataCS},
                undefined,
                undefined,
                {'ddd': dataCS}
              ],
              type,
              dataCS
            );
          });
        }
      });
    }
  });
  describe('chunking of inserts and removes ', () => {
    let testReversibleChangeSetChunking = (operation, boundaries, expectedChunkCS, nestedType, nestedData) => {
      let operationName = operation;
      if (operation === 'reversible remove') {
        operationName = 'remove';
      }

      let CS;
      if (operation === 'remove') {
        CS = {
          [operationName]: ['data']
        };
      } else {
        CS = {
          [operationName]: {
            'NodeProperty': {
              'data': {
                'insert': {
                  [nestedType]: {
                    'bbb': nestedData,
                    'ddd': nestedData
                  }
                }
              }
            }
          }
        };
      }

      boundaries = boundaries.map((x) =>
         'data\u0000' + x + '\u0000'
      );

      let chunks = chunkChangeSet(CS, undefined, boundaries);
      expect(chunks.length).to.eql(expectedChunkCS.length);

      for (let i = 0; i < expectedChunkCS.length; i++) {
        if (operation === 'remove') {
          expect(chunks[i].changeSet).to.eql({
            [operationName]: ['data']
          });
        } else {
          expect(chunks[i].changeSet).to.eql({
            [operationName]: {
              'NodeProperty': {
                'data': expectedChunkCS[i] ? {
                  'insert': {
                    [nestedType]: expectedChunkCS[i]
                  }
                } : {}
              }
            }
          });
        }
      }
    };

    for (let [dataTypeDescription, type, dataCS] of [
      ['with primitives', 'String', 'test'],
      ['with NodeProperties', 'NodeProperty', {
        'insert': {
          'String': {
            'NestedData': 'Test'
          }
        }
      }]
    ]) {
      describe(dataTypeDescription, () => {
        for (let [operation, article] of [
            //['insert', 'an'],
            //['remove', 'a'],
            ['reversible remove', 'a']
        ]) {

          it('should correctly chunk ' + article + ' ' + operation + ' into multiple ' + operation + 's', () => {
            testReversibleChangeSetChunking(operation, ['ccc'],
              [
                {'bbb': dataCS},
                {'ddd': dataCS}
              ],
              type,
              dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation + ', leaving an empty initial ' + operation, () => {
            testReversibleChangeSetChunking(operation,
              ['aaa'],
              [
                undefined,
                {'bbb': dataCS, 'ddd': dataCS}
              ],
              type,
              dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation +
            ', leaving multiple empty initial ' + operation + 's', () => {
            testReversibleChangeSetChunking(operation,
              ['aaa', 'aaa1', 'aaa2'],
              [undefined, undefined, undefined, {'bbb': dataCS, 'ddd': dataCS}],
              type, dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation + ', leaving an empty final ' + operation, () => {
            testReversibleChangeSetChunking(operation,
              ['eee'],
              [
                {'bbb': dataCS, 'ddd': dataCS},
                undefined
              ],
              type,
              dataCS
            );
          });

          it('should correctly chunk ' + article + ' ' + operation +
            ', leaving multiple empty final ' + operation + 's', () => {
            testReversibleChangeSetChunking(operation,
              ['eee', 'fff', 'ggg'],
              [{'bbb': dataCS, 'ddd': dataCS}, undefined, undefined, undefined],
              type, dataCS
            );
          });
          it('should correctly create ' + operation + ' chunks for ranges in the middle', () => {
            testReversibleChangeSetChunking(operation,
              ['cc1', 'cc2', 'cc3'],
              [
                {'bbb': dataCS},
                undefined,
                undefined,
                {'ddd': dataCS}
              ],
              type,
              dataCS
            );
          });
        }
      });
    }
  });
  describe('Chunking of arrays', () => {
    it('should not chunk arrays leaving an empty chunk', function() {
      this.timeout(10000);
      let changeSet = {
        insert: {
          NodeProperty: {
            a: {
              insert: {
                NodeProperty: {
                  b: {
                    insert: {
                      NodeProperty: {
                        c: {
                          insert: {
                            'Array<Float32>': {
                              arr: { insert: [[0, Array(10000000).fill(3.141698371)]] }
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
      };

      const chunks = chunkChangeSet(changeSet, 16384);

      expect(chunks.length).to.eql(1);
    });
  });
});
