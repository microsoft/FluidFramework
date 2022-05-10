/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* eslint max-nested-callbacks: 0 */
const settings = require('../../src/server/utils/server_settings');
const sinon = require('sinon');
const sandbox = sinon.createSandbox();
const DynamoDB = require('../../src/materialized_history_service/storage_backends/dynamodb');

const TABLE_NAME = 'local.materializedHistory';
const LARGE_STRING_SIZE = 500 * 1000;

let DynamoClientAPI = {
  ddbClient: {
    batchGetItem: function() {},
    batchWriteItem: function() {}
  },
  start: function() {},
  init: function() {},
  stop: function() {}
};

let BigStoreAPI = {
  deleteAll: function() {},
  getObject: function() {},
  putObject: function() {}
};

describe('DynamoDB Storage Backend', () => {
  let ddbStorage;

  let batchGetItemStub;
  let batchWriteItemStub;
  let deleteAllStub;
  let getObjectStub;
  let putObjectStub;

  afterEach(() => {
    sandbox.restore();
  });

  before(() => {
    ddbStorage = new DynamoDB({
      settings: settings.get('mh:dynamoDBBackend'),
      ddbSettings: settings.get('store-dynamodb'),
      credsRotation: DynamoClientAPI,
      bigStore: BigStoreAPI,
      keyspace: 'local'
    });

    return ddbStorage.init();
  });

  describe('Reading nodes', () => {
    describe('Stored inline', () => {

      let theKey = 'i:12341234:56785678';

      describe('With a dynamodb failure', () => {
        before(() => {
          batchGetItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
            .rejects(new Error('Something went super wrong with DynamoDB'));
        });

        it('should bubble the error up', () =>
          expect(
            ddbStorage.get(theKey)
          ).to.be.rejectedWith('Something went super wrong with DynamoDB')
        );

        it('should have called DynamoDB', () =>
          expect(batchGetItemStub.called).to.eql(true)
        );
      });

      describe('With success and an existing value', () => {
        let theValue = '{"a": "b"}';

        before(() => {
          sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
            .resolves({
              'local.materializedHistory': [{
                PK: theKey,
                SK: '.',
                value: theValue
              }]
            });
        });

        it('should return the value', () =>
          expect(
            ddbStorage.get(theKey)
          ).to.eventually.eql(theValue)
        );

        it('should have called DynamoDB', () =>
          expect(batchGetItemStub.called).to.eql(true)
        );
      });

      describe('With success and no value', () => {

        before(() => {
          sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
            .resolves({
              'local.materializedHistory': []
            });
        });

        it('should return the value', () =>
          expect(
            ddbStorage.get(theKey)
          ).to.eventually.eql(undefined)
        );

        it('should have called DynamoDB', () =>
          expect(batchGetItemStub.called).to.eql(true)
        );
      });
    });

    describe('Stored in S3', () => {
      let theKey = 'i:12341234:56785678';
      let theS3Key = 'aS3Key';
      let theValue = '{"a": "b"}';

      beforeEach(() => {
        sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
          .resolves({
            'local.materializedHistory': [{
              PK: theKey,
              SK: '.',
              s3Key: theS3Key
            }]
          });
      });

      describe('with a S3 failure', () => {
        before(() => {
          getObjectStub = sandbox.stub(BigStoreAPI, 'getObject')
            .withArgs(theS3Key)
            .rejects(new Error('S3 didn\'t feel like cooperating today.  Sorry.'));
        });

        it('should bubble the error up', () =>
          expect(
            ddbStorage.get(theKey)
          ).to.be.rejectedWith('S3 didn\'t feel like cooperating today.  Sorry.'));

        it('should have called S3', () =>
          expect(getObjectStub.called).to.eql(true)
        );
      });

      describe('with success reading S3', () => {
        before(() => {
          getObjectStub = sandbox.stub(BigStoreAPI, 'getObject')
            .resolves(Buffer.from(theValue));
        });

        it('should return the value', () =>
          expect(
            ddbStorage.get(theKey)
          ).to.eventually.eql(theValue)
        );

        it('should have called S3', () =>
          expect(getObjectStub.called).to.eql(true)
        );
      });
    });

    describe('Get batching', () => {
      let nodeRefs;
      let stub;

      beforeEach(() => {
        const numberOfNodes = 20;
        nodeRefs = [];
        for (let i = 0; i < numberOfNodes; i++) {
          nodeRefs.push({
            PK: `i:12341234:${i.toString().padStart(8, '0')}`,
            SK: '.',
            value: 'someValue'
          });
        }
        const fakeResult = {};
        fakeResult[TABLE_NAME] = nodeRefs;
        stub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
          .withArgs(sinon.match.any)
          .resolves(fakeResult);
      });

      it('should batch consecutive requests with different parameters', async () => {
        const promises = [];
        for (let i = 0; i < nodeRefs.length; i++) {
          promises.push(ddbStorage.get(nodeRefs[i].PK));
        }
        await Promise.all(promises);

        expect(stub).to.have.been.calledOnce;
        const expectedArg = {};
        expectedArg[TABLE_NAME] = nodeRefs.map((nodeRef) => {
          return { PK: nodeRef.PK, SK: '.' };
        });
        expect(stub).to.have.been.calledWith(sinon.match(expectedArg));
      });

      it('should make only one call with the same parameters', async () => {
        const promises = [];
        for (let i = 0; i < nodeRefs.length; i++) {
          promises.push(ddbStorage.get(nodeRefs[0].PK));
        }
        await Promise.all(promises);

        expect(stub).to.have.been.calledOnce;
        const expectedArg = {};
        expectedArg[TABLE_NAME] = [{ PK: nodeRefs[0].PK, SK: '.' }];
        expect(stub).to.have.been.calledWith(sinon.match(expectedArg));
      });
    });
  });

  describe('Without a write batch started', () => {
    let fakeBatchId = {
      guid: 'I am not an existing batch, sorry'
    };

    describe('calling store', () => {
      it('should throw', () =>
        expect(() =>
          ddbStorage.store(fakeBatchId, 'b:12341234:5685678', JSON.stringify({}))
        ).to.throw('Trying to store in a non-started batch')
      );
    });

    describe('calling update', () => {
      it('should throw', () =>
        expect(() =>
          ddbStorage.update(fakeBatchId, 'b:12341234:5685678', JSON.stringify({}))
        ).to.throw('Trying to update in a non-started batch')
      );
    });

    describe('calling finishWriteBatch', () => {
      it('should throw', () =>
        expect(() =>
          ddbStorage.finishWriteBatch(fakeBatchId)
        ).to.throw('Trying to finish a non-started batch')
      );
    });
  });

  describe('With a started write batch', () => {
    let createdBatch;

    beforeEach(() => {
      createdBatch = ddbStorage.startWriteBatch();
      expect(ddbStorage._writeCargos[createdBatch.guid]).to.exist;
    });

    // TODO: With a number of times exceeding the cargo size
    describe('with store() called twice with small payloads', () => {
      let item1Id = 'i:12341234:12341234';
      let item2Id = 'i:45674567:45674567';

      let item1Value = '{"a": "b"}';
      let item2Value = '{"c": "d"}';

      beforeEach(() => {
        ddbStorage.store(createdBatch, item1Id, item1Value);
        ddbStorage.store(createdBatch, item2Id, item2Value);
      });

      describe('calling finishWriteBatch', () => {
        let expectedArgs = {};

        expectedArgs[TABLE_NAME] = {
          operation: 'insert',
          items: []
        };

        expectedArgs[TABLE_NAME].items = [{
          PK: item1Id,
          SK: '.',
          value: item1Value,
          s3Key: null
        }, {
          PK: item2Id,
          SK: '.',
          value: item2Value,
          s3Key: null
        }];

        describe('with a DynamoDB failure', () => {
          before(() => {
            batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
              .withArgs(expectedArgs)
              .rejects(new Error('Something went super wrong with DynamoDB'));
          });

          it('should reject with the error', () =>
            expect(
              ddbStorage.finishWriteBatch(createdBatch)
            ).to.be.rejectedWith('Something went super wrong with DynamoDB')
          );

          it('should have called DynamoDB', () =>
            expect(batchWriteItemStub.called).to.eql(true)
          );
        });

        describe('with success in DynamoDB', () => {
          before(() => {
            batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
              .withArgs(expectedArgs)
              .resolves();
          });

          it('should resolve', () =>
            expect(
              ddbStorage.finishWriteBatch(createdBatch)
            ).to.be.eventually.fulfilled
          );

          it('should have called DynamoDB', () =>
            expect(batchWriteItemStub.called).to.eql(true)
          );
        });
      });
    });

    describe('with store called twice with large payloads', () => {
      let item1Id = 'i:12341234:12341234';
      let item2Id = 'i:45674567:45674567';

      let item1Value = JSON.stringify({a: Array(LARGE_STRING_SIZE).fill('a').join('')});
      let item2Value = JSON.stringify({b: Array(LARGE_STRING_SIZE).fill('b').join('')});

      beforeEach(() => {
        ddbStorage.store(createdBatch, item1Id, item1Value);
        ddbStorage.store(createdBatch, item2Id, item2Value);
      });

      describe('calling finishWriteBatch', () => {
        describe('with an S3 failure', () => {
          before(() => {
            putObjectStub = sandbox.stub(BigStoreAPI, 'putObject')
              .rejects(new Error('S3 API did not cooperate today.  Sorry'));
          });

          before(() => {
            deleteAllStub = sandbox.stub(BigStoreAPI, 'deleteAll')
              .rejects(new Error('S3 API for delete did not cooperate today.  Sorry'));
          });

          before(() => {
            batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
              .resolves();
          });

          it('should bubble up the exception', () =>
            expect(
              ddbStorage.finishWriteBatch(createdBatch)
            ).to.be.rejectedWith('S3 API did not cooperate today.  Sorry')
          );

          it('should have called putObject', () => {
            expect(putObjectStub.callCount).to.eql(2);
          });

          it('should not have called DynamoDB', () => {
            expect(batchWriteItemStub.called).to.eql(false);
          });

          it('should have attempted to delete the created S3 items from this batch', () => {
            expect(deleteAllStub.called).to.eql(true);
          });
        });

        describe('with an S3 success', () => {
          before(() => {
            putObjectStub = sandbox.stub(BigStoreAPI, 'putObject')
              .resolves();
          });

          describe('with a DynamoDB failure', () => {
            before(() => {
              batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
                .rejects(new Error('DynamoDB failed... Oops.'));
            });

            before(() => {
              deleteAllStub = sandbox.stub(BigStoreAPI, 'deleteAll')
                .resolves();
            });

            it('should bubble up the error', () =>
              expect(
                ddbStorage.finishWriteBatch(createdBatch)
              ).to.be.rejectedWith('DynamoDB failed... Oops.')
            );

            it('should have called putObject', () => {
              expect(putObjectStub.callCount).to.eql(2);
            });

            it('should have called DynamoDB', () =>
              expect(batchWriteItemStub.called).to.eql(true)
            );

            it('should have attempted to delete the created S3 items', () => {
              expect(deleteAllStub.called).to.eql(true);
            });
          });

          describe('with a DynamoDB success', () => {
            before(() => {
              batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
                .onCall(0)
                .resolves();
            });

            it('should resolve', () =>
              expect(
                ddbStorage.finishWriteBatch(createdBatch)
              ).to.be.fulfilled
            );

            it('should have called DynamoDB', () => {
              expect(batchWriteItemStub.called).to.eql(true);
            });
          });
        });
      });
    });

    describe('with update() called with a large payload and a previously large payload', () => {
      let item1Id = 'i:12341235:12341235';
      let item2Id = 'i:45674568:45674568';

      let item1Value = JSON.stringify({a: Array(LARGE_STRING_SIZE).fill('a').join('')});
      let item2Value = JSON.stringify({b: 'c'});

      beforeEach(() => {
        ddbStorage.update(createdBatch, item1Id, item1Value, {});
        ddbStorage.update(createdBatch, item2Id, item2Value, { originalNodeSize: 600 * 1000});
      });

      describe('calling finishWriteBatch', () => {
        describe('with a DynamoDB failure when writing', () => {
          before(() => {
            batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
              .rejects(new Error('DynamoDB failed... Oops.'));
          });

          before(() => {
            putObjectStub = sandbox.stub(BigStoreAPI, 'putObject')
              .resolves();
          });

          before(() => {
            deleteAllStub = sandbox.stub(BigStoreAPI, 'deleteAll')
              .resolves();
          });

          it('should bubble up the error', () =>
            expect(
              ddbStorage.finishWriteBatch(createdBatch)
            ).to.be.rejectedWith('DynamoDB failed... Oops.')
          );

          it('should have called DynamoDB', () =>
            expect(batchWriteItemStub.called).to.eql(true)
          );

          it('should have attempted to delete the created S3 items', () => {
            expect(deleteAllStub.called).to.eql(true);
            let callArgs = deleteAllStub.getCall(0).args[0];
            expect(callArgs.length).to.eql(1);
            expect(callArgs[0].startsWith(item1Id)).to.eql(true);
          });

          it('should not have attempted to delete what would have been the outdated S3 items', () => {
            expect(deleteAllStub.callCount).to.eql(1);
          });
        });

        describe('with a DynamoDB failure when fetching the previous S3 key', () => {
          before(() => {
            batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
              .resolves();
          });

          before(() => {
            putObjectStub = sandbox.stub(BigStoreAPI, 'putObject')
              .resolves();
          });

          before(() => {
            deleteAllStub = sandbox.stub(BigStoreAPI, 'deleteAll')
              .resolves();
          });

          before(() => {
            batchGetItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
              .rejects(new Error('Could not batchGetItem'));
          });

          it('should bubble up the error', () =>
            expect(
              ddbStorage.finishWriteBatch(createdBatch)
            ).to.be.rejectedWith('Could not batchGetItem')
          );

          it('should not have written to DynamoDB', () =>
            expect(batchWriteItemStub.called).to.eql(false)
          );

          it('should have attempted to delete the created S3 items', () => {
            expect(deleteAllStub.called).to.eql(true);
            let callArgs = deleteAllStub.getCall(0).args[0];
            expect(callArgs.length).to.eql(1);
            expect(callArgs[0].startsWith(item1Id)).to.eql(true);
          });

          it('should not have attempted to delete what would have been the outdated S3 items', () => {
            expect(deleteAllStub.callCount).to.eql(1);
          });
        });

        describe('with a DynamoDB success', () => {
          let previousS3Key = 'a-previous-s3-key';

          before(() => {
            batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
              .resolves();
          });

          before(() => {
            putObjectStub = sandbox.stub(BigStoreAPI, 'putObject')
              .resolves();
          });

          before(() => {
            deleteAllStub = sandbox.stub(BigStoreAPI, 'deleteAll')
              .resolves();
          });

          before(() => {
            let toResolveWith = {};
            toResolveWith[TABLE_NAME] = [{
              s3Key: previousS3Key
            }];

            batchGetItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
              .resolves(toResolveWith);
          });

          it('should resolve', () =>
            expect(
              ddbStorage.finishWriteBatch(createdBatch)
            ).to.be.fulfilled
          );

          it('should have called DynamoDB to write', () =>
            expect(batchWriteItemStub.called).to.eql(true)
          );

          it('should have called DynamoDB to fetch the old S3 key', () => {
            let callArgs = batchGetItemStub.getCall(0).args;
            expect(callArgs[0][TABLE_NAME][0].PK).to.eql(item2Id);
            expect(batchGetItemStub.called).to.eql(true);
          });

          it('should have attempted to delete the outdated created S3 items', () => {
            expect(deleteAllStub.called).to.eql(true);
            let callArgs = deleteAllStub.getCall(0).args[0];
            expect(callArgs.length).to.eql(1);
            expect(callArgs[0]).to.eql(previousS3Key);
          });
        });

        describe('calling finishWriteBatch twice', () => {
          let previousS3Key = 'a-previous-s3-key';

          before(() => {
            batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
              .resolves();
          });

          before(() => {
            putObjectStub = sandbox.stub(BigStoreAPI, 'putObject')
              .resolves();
          });

          before(() => {
            deleteAllStub = sandbox.stub(BigStoreAPI, 'deleteAll')
              .resolves();
          });

          before(() => {
            let toResolveWith = {};
            toResolveWith[TABLE_NAME] = [{
              s3Key: previousS3Key
            }];

            batchGetItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
              .resolves(toResolveWith);
          });

          it('should resolve the first one and throw on the second one', () => {
              // We have to add a task to the batch, as otherwise, it will be cleaned
              // as soon as the first finishWriteBatch is called.
              ddbStorage.update(createdBatch, 'i:12341235:12341235', 'xxx', {});

              return Promise.all([
                expect(
                  ddbStorage.finishWriteBatch(createdBatch)
                ).to.be.fulfilled,
                expect(() => ddbStorage.finishWriteBatch(createdBatch))
                  .to.throw('Trying to finish an already finished batch')
              ])
            }
          );
        });
      });
    });

    describe('with a single store called', () => {
      let aBatch;

      describe('calling finishWriteBatch concurrently with store', () => {

        before(() => {
          aBatch  = ddbStorage.startWriteBatch();
          ddbStorage.store(aBatch, 'an-id', {a: 'value'});
        });

        before(() => {
          batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
            .returns(new Promise((res, rej) => {
              setTimeout(res, 100);
            }));
        });

        it('should throw on the store', () => {
          return Promise.all([
            ddbStorage.finishWriteBatch(aBatch),
            expect(() => ddbStorage.store(aBatch, 'some-id', {a: 'value'}))
              .to.throw('Trying to store in an already finished batch')
          ]);
        });
      });

      describe('calling finishWriteBatch concurrently with update', () => {
        before(() => {
          aBatch  = ddbStorage.startWriteBatch();
          ddbStorage.store(aBatch, 'an-id', {a: 'value'});
        });

        before(() => {
          batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
            .returns(new Promise((res, rej) => {
              setTimeout(res, 100);
            }));
        });

        it('should throw on the update', () => {
          return Promise.all([
            ddbStorage.finishWriteBatch(aBatch),
            expect(() => ddbStorage.update(aBatch, 'anothyer-id', {a: 'value'}))
              .to.throw('Trying to update in an already finished batch')
          ]);
        });
      });

      describe('calling update on an error state', () => {
        before(() => {
          aBatch  = ddbStorage.startWriteBatch();
          ddbStorage.store(aBatch, 'an-id', {a: 'value'});
        });

        before(() => {
          batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
            .onCall(0)
            .resolves(new Error('It does not work today'))
            .onCall(1)
            .rejects(new Error('It does not work today'))
            .onCall(2)
            .rejects(new Error('It does not work today'));
        });

        it('should do nothing on the update', () =>
          ddbStorage.update(aBatch, 'another-id', {a: 'value'})
        );

        it('should do nothing on the update', () =>
          ddbStorage.update(aBatch, 'another-id2', {a: 'value'})
        );

        it('should not have called batchWriteItem for the second call made on errored state', () => {
          expect(batchWriteItemStub.callCount).to.eql(2);
        });
      });

      describe('calling store on an error state', () => {
        before(() => {
          aBatch  = ddbStorage.startWriteBatch();
          ddbStorage.store(aBatch, 'an-id', {a: 'value'});
        });

        before(() => {
          batchWriteItemStub = sandbox.stub(DynamoClientAPI.ddbClient, 'batchWriteItem')
            .onCall(0)
            .resolves(new Error('It does not work today'))
            .onCall(1)
            .rejects(new Error('It does not work today'))
            .onCall(2)
            .rejects(new Error('It does not work today'));
        });

        it('should do nothing on the update', () =>
          ddbStorage.store(aBatch, 'another-id', {a: 'value'})
        );

        it('should do nothing on the update', () =>
          ddbStorage.store(aBatch, 'another-id2', {a: 'value'})
        );

        it('should not have called batchWriteItem for the second call made on errored state', () => {
          expect(batchWriteItemStub.callCount).to.eql(2);
        });
      });
    });
  });

  describe('deleting nodes', () => {
    let theKey = 'i:12341234';
    describe('without an S3 reference', () => {
      describe('successfully', () => {
        let theValue = '{"a": "b"}';

        before(() => {
          sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
            .resolves({
              'local.materializedHistory': [{
                PK: theKey,
                SK: '.',
                value: theValue
              }]
            });
        });

        it('should do the deletion', () =>
          ddbStorage.delete(theKey)
        );

        it('should read the item', () => {
          expect(batchGetItemStub.called).to.eql(true);
        });

        it('should call batchWriteItem properly', () => {
          expect(batchWriteItemStub.called).to.eql(true);
        });
      });

      describe('failing to read', () => {
        before(() => {
          sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
            .rejects(new Error('Reading failed'));
        });

        it('should bubble the error up', () =>
          expect(ddbStorage.delete(theKey)).to.be.rejectedWith(Error, 'Reading failed')
        );

        it('should have read the item', () => {
          expect(batchGetItemStub.called).to.eql(true);
        });
      });

      describe('for a non-existing item', () => {
        before(() => {
          sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
            .resolves({
              'local.materializedHistory': []
            });
        });

        it('should succeed', () =>
          expect(ddbStorage.delete('notExisting')).to.eventually.eql(undefined)
        );

        it('should read the item', () => {
          expect(batchGetItemStub.called).to.eql(true);
        });
      });
    });

    describe('with an S3 reference', () => {
      before(() => {
        sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
          .resolves({
            'local.materializedHistory': [{
              PK: theKey,
              SK: '.',
              s3Key: 'anS3Key'
            }]
          });
      });

      it('should succeed', () =>
        expect(ddbStorage.delete(theKey)).to.eventually.eql(undefined)
      );

      it('should read the item', () => {
        expect(batchGetItemStub.called).to.eql(true);
      });

      it('should call S3 delete', () => {
        expect(deleteAllStub.called).to.eql(true);
      });

      it('should call batchWriteItem properly', () => {
        expect(batchWriteItemStub.called).to.eql(true);
      });
    });

    describe('with an S3 failure', () => {
      before(() => {
        sandbox.stub(DynamoClientAPI.ddbClient, 'batchGetItem')
          .resolves({
            'local.materializedHistory': [{
              PK: theKey,
              SK: '.',
              s3Key: 'anS3Key'
            }]
          });

        sandbox.stub(BigStoreAPI, 'deleteAll')
          .rejects(new Error('S3 API for delete did not cooperate today.  Sorry'));
      });

      it('should succeed', () =>
        expect(ddbStorage.delete(theKey)).to.eventually.eql(undefined)
      );

      it('should read the item', () => {
        expect(batchGetItemStub.called).to.eql(true);
      });

      it('should call S3 delete', () => {
        expect(deleteAllStub.called).to.eql(true);
      });
    });
  });
});
