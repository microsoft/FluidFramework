/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unused-expressions */
const crypto = require("crypto");
const { LocalResolver, LocalDocumentServiceFactory } = require("@fluidframework/local-driver");
const { requestFluidObject } = require("@fluidframework/runtime-utils");
const { LocalDeltaConnectionServer } = require("@fluidframework/server-local-server");
const {
  createAndAttachContainer,
  createLoader,
  LoaderContainerTracker,
  TestFluidObjectFactory,
} = require("@fluidframework/test-utils");
const { DeterministicRandomGenerator } = require("@fluid-experimental/property-common");
const _ = require("lodash");
const { PropertyFactory } = require("@fluid-experimental/property-properties");
const { assert } = require("@fluidframework/common-utils");
const { SharedPropertyTree } = require("@fluid-experimental/property-dds");
const createMhs = require('../utils/create_mhs');
const { generateGUID } = require('@fluid-experimental/property-common').GuidUtils;


function createLocalLoader(
  packageEntries,
  deltaConnectionServer,
  urlResolver,
  options,
) {
  const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
  return createLoader(packageEntries, documentServiceFactory, urlResolver, undefined, options);
}

function createDerivedGuid(referenceGuid, identifier) {
  const hash = crypto.createHash("sha1");
  hash.write(`${referenceGuid}:${identifier}`);
  hash.end();

  const hexHash = hash.digest("hex");
  return (
    `${hexHash.substr(0, 8)}-${hexHash.substr(8, 4)}-` +
    `${hexHash.substr(12, 4)}-${hexHash.substr(16, 4)}-${hexHash.substr(20, 12)}`
  );
}
console.assert = (condition, ...data) => {
  assert(!!condition, "Console Assert");
};

function getFunctionSource(fun) {
  let source = fun.toString();
  source = source.replace(/^.*=>\s*{?\n?\s*/m, "");
  source = source.replace(/}\s*$/m, "");
  source = source.replace(/^\s*/gm, "");

  return source;
}

async function processWithMH(queue, mhService) {
  let branchGuid;

  for (const op of queue) {

    if (op.referenceGuid === "" && branchGuid === undefined) {
      branchGuid = generateGUID();
      const rootCommitGuid = generateGUID();
      await mhService.createBranch({
        guid: branchGuid,
        rootCommitGuid,
        meta: {}
      });
      op.referenceGuid = rootCommitGuid;
    }

    await mhService.createCommit({
      guid: op.guid,
      branchGuid,
      parentGuid: op.referenceGuid,
      changeSet: JSON.stringify(op.changeSet),
      meta: {
        remoteHeadGuid: op.remoteHeadGuid,
        localBranchStart: op.localBranchStart,
      },
      rebase: true,
    })
  }
  return branchGuid;
}

describe("Rebasing", () => {
  const documentId = "localServerTest";
  const documentLoadUrl = `fluid-test://localhost/${documentId}`;
  const propertyDdsId = "PropertyTree";
  const codeDetails = {
    package: "localServerTestPackage",
    config: {},
  };
  const factory = new TestFluidObjectFactory([[propertyDdsId, SharedPropertyTree.getFactory()]]);

  let deltaConnectionServer;
  let urlResolver
  let opProcessingController;
  let container1;
  let container2;
  let dataObject1;
  let dataObject2;
  let sharedPropertyTree1;
  let sharedPropertyTree2;
  let mhService;
  let queue = [];

  let errorHandler;

  async function createContainer() {
    const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
    opProcessingController.add(loader);
    return createAndAttachContainer(codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
  }

  async function loadContainer() {
    const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
    opProcessingController.add(loader);
    return loader.resolve({ url: documentLoadUrl });
  }

  function createRandomTests(
    operations,
    final,
    count = 100,
    startTest = 0,
    maxOperations = 30,
  ) {
    for (let i = startTest; i < count; i++) {
      const seed = createDerivedGuid("", String(i));
      it(`Generated Test Case #${i} (seed: ${seed})`, async () => {
        let testString = "";

        errorHandler = (err) => {
          console.error(`Failed Test code: ${testString}`);
        };
        const random = new DeterministicRandomGenerator(seed);
        const operationCumSums = [];
        for (const operation of operations) {
          operationCumSums.push(
            (operationCumSums[operationCumSums.length - 1] != null ? operationCumSums[operationCumSums.length - 1] : 0) + operation.probability,
          );
        }

        try {
          const numOperations = random.irandom(maxOperations);
          const maxCount = operationCumSums[operationCumSums.length - 1];
          for (const j of _.range(numOperations)) {
            const operationId = 1 + (random.irandom(maxCount));
            const selectedOperation = _.sortedIndex(operationCumSums, operationId);

            const parameters = operations[selectedOperation].getParameters(random);

            // Create the source code for the test
            let operationSource = getFunctionSource(operations[selectedOperation].op.toString());
            for (const [key, value] of Object.entries(parameters)) {
              const valueString = _.isFunction(value) ? getFunctionSource(value) : value.toString();
              operationSource = operationSource.replace(
                new RegExp(`parameters.${key}\\(?\\)?`),
                valueString,
              );
            }
            testString += operationSource;

            await operations[selectedOperation].op(parameters);
          }

          testString += getFunctionSource(final);
          await final();
        } catch (e) {
          console.error(`Failed Test code: ${testString}`);
          throw e;
        }
      });
    }
  }

  beforeEach(async () => {
    opProcessingController = new LoaderContainerTracker();

    ({ mhService } = createMhs({ 'mh:chunkSize': 16 }));
    await mhService.init();

    deltaConnectionServer = LocalDeltaConnectionServer.create();
    urlResolver = new LocalResolver();

    // Create a Container for the first client.
    container1 = await createContainer();
    dataObject1 = await requestFluidObject(container1, "default");
    sharedPropertyTree1 = await dataObject1.getSharedObject(propertyDdsId);
    (sharedPropertyTree1).__id = 1; // Add an id to simplify debugging via conditional breakpoints

    const old_applyRemoteChangeSet1 = sharedPropertyTree1._applyRemoteChangeSet.bind(sharedPropertyTree1);
    sharedPropertyTree1._applyRemoteChangeSet = (op) => {
      // createMHBranch(op).then(() =>{
      //     const commit = opToCommit(op);
      //     return mhService.createCommit(commit)
      // });
      queue.push(op);
      return old_applyRemoteChangeSet1(op);
    }

    // Load the Container that was created by the first client.
    container2 = await loadContainer();
    dataObject2 = await requestFluidObject(container2, "default");
    sharedPropertyTree2 = await dataObject2.getSharedObject(propertyDdsId);
    (sharedPropertyTree2).__id = 2; // Add an id to simplify debugging via conditional breakpoints


    // Attach error handlers to make debugging easier and ensure that internal failures cause the test to fail
    errorHandler = (err) => { }; // This enables the create random tests function to register its own handler
    container1.on("closed", (err) => {
      if (err !== undefined) {
        errorHandler(err);
        throw err;
      }
    });
    container2.on("closed", (err) => {
      if (err !== undefined) {
        errorHandler(err);
        throw err;
      }
    });
  });

  afterEach(() => mhService.stop());

  describe("with non overlapping inserts", () => {
    let ACount;
    let CCount;

    beforeEach(async () => {
      // Insert and prepare an array within the container
      await opProcessingController.pauseProcessing();
      sharedPropertyTree1.root.insert("array", PropertyFactory.create("String", "array"));

      const array = sharedPropertyTree1.root.get("array");
      array.push("B1");
      array.push("B2");
      array.push("B3");
      sharedPropertyTree1.commit();

      ACount = 0;
      CCount = 0;
      queue.splice(0, queue.length)

      // Make sure both shared trees are in sync
      await opProcessingController.ensureSynchronized();
      await opProcessingController.pauseProcessing();
    });

    afterEach(async () => {

      const branchGuid = await processWithMH(queue, mhService);
      const branch = await mhService.getBranch(branchGuid);
      const mv = await mhService.getCommitMV({ guid: branch.headCommitGuid, branchGuid })
      const mhResult = PropertyFactory.create('NodeProperty');
      mhResult.applyChangeSet(mv.changeSet);

      const result = _.range(1, ACount + 1)
        .map((i) => `A${i}`)
        .concat(["B1", "B2", "B3"])
        .concat(_.range(1, CCount + 1).map((i) => `C${i}`));

      const array1 = sharedPropertyTree1.root.get("array");
      const array2 = sharedPropertyTree2.root.get("array");
      const array3 = mhResult.get("array");

      for (const array of [array1, array2, array3]) {
        for (const [i, value] of result.entries()) {
          expect(array.get(i)).to.equal(value);
        }
      }
    });

    function insertInArray(tree, letter) {
      const array = tree.root.get("array");

      // Find the insert position
      let insertPosition;
      let insertString;
      if (letter === "A") {
        // We insert all As in front of B1
        const values = array.getValues();
        insertPosition = values.indexOf("B1");

        // For these letters we can just use the position to get the number for the inserted string
        insertString = `A${insertPosition + 1}`;

        ACount++;
      } else {
        // Alway insert B at the end
        insertPosition = array.getLength();

        // Get the number from the previous entry
        const previous = array.get(insertPosition - 1);
        const entryNumber = previous[0] === "B" ? 1 : Number.parseInt(previous[1], 10) + 1;
        insertString = `C${entryNumber}`;

        CCount++;
      }

      array.insert(insertPosition, insertString);
      tree.commit();
    }

    it("Should work when doing two batches with synchronization inbetween", async () => {
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");

      await opProcessingController.ensureSynchronized();

      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree2, "C");

      await opProcessingController.ensureSynchronized();
    });

    it("Should work when doing two batches without synchronization inbetween", async () => {
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");

      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree2, "C");

      await opProcessingController.ensureSynchronized();
    });

    it("Should work when creating local branches with different remote heads", async () => {
      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.processOutgoing(container1);
      await opProcessingController.processIncoming(container2);
      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.processOutgoing(container1);
      await opProcessingController.processIncoming(container2);
      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree1, "A");

      await opProcessingController.ensureSynchronized();
    });

    it("Should work when synchronizing after each operation", async () => {
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.ensureSynchronized();
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.ensureSynchronized();
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.ensureSynchronized();

      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.ensureSynchronized();
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.ensureSynchronized();
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.ensureSynchronized();
    });

    it("Should work when synchronizing after pairs of operations", async () => {
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.ensureSynchronized();
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.ensureSynchronized();
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.ensureSynchronized();
    });

    it("works with overlapping sequences", async () => {
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.processOutgoing(container2);

      // Insert five operations to make this overlap with the insert position of C
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.processIncoming(container1);
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.processIncoming(container2);

      await opProcessingController.ensureSynchronized();
    });

    it("Should work when the remote head points to a change that is not the reference change", async () => {
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.processOutgoing(container2);
      insertInArray(sharedPropertyTree1, "A");
      await opProcessingController.processOutgoing(container1);
      insertInArray(sharedPropertyTree2, "C");
      await opProcessingController.processIncoming(container2);
      insertInArray(sharedPropertyTree2, "C");
      insertInArray(sharedPropertyTree2, "C");

      await opProcessingController.ensureSynchronized();
    });

    describe("Randomized Tests", () => {
      const count = 100;
      const startTest = 0;
      const logTest = true;

      for (let i = startTest; i < count; i++) {
        const seed = createDerivedGuid("", String(i));
        it(`Generated Test Case ${i} (Seed ${i})`, async () => {
          const random = new DeterministicRandomGenerator(seed);
          let testString = "";

          const numOperations = random.irandom(30);
          for (const j of _.range(numOperations)) {
            const operation = random.irandom(6);
            switch (operation) {
              case 0:
                insertInArray(sharedPropertyTree1, "A");
                if (logTest) {
                  testString += 'insertInArray(sharedPropertyTree1, "A");\n';
                }
                break;
              case 1:
                insertInArray(sharedPropertyTree2, "C");
                if (logTest) {
                  testString += 'insertInArray(sharedPropertyTree2, "C");\n';
                }
                break;
              case 2:
                await opProcessingController.processOutgoing(container1);
                if (logTest) {
                  testString +=
                    "await opProcessingController.processOutgoing(container1);\n";
                }
                break;
              case 3:
                await opProcessingController.processIncoming(container1);
                if (logTest) {
                  testString +=
                    "await opProcessingController.processIncoming(container1);\n";
                }
                break;
              case 4:
                await opProcessingController.processOutgoing(container2);
                if (logTest) {
                  testString +=
                    "await opProcessingController.processOutgoing(container2);\n";
                }
                break;
              case 5:
                await opProcessingController.processIncoming(container2);
                if (logTest) {
                  testString +=
                    "await opProcessingController.processIncoming(container2);\n";
                }
                break;
              default:
                throw new Error("Should never happen");
            }
          }

          await opProcessingController.ensureSynchronized();
          if (logTest) {
            testString +=
              "await opProcessingController.ensureSynchronized();\n";
          }
        });
      }
    });
  });

  describe("with inserts and deletes at arbitrary positions", () => {
    let createdProperties;
    let deletedProperties;
    beforeEach(async () => {
      createdProperties = new Set();
      deletedProperties = new Set();
      (PropertyFactory)._reregister({
        typeid: "test:namedEntry-1.0.0",
        inherits: ["NamedProperty"],
        properties: [],
      });

      await opProcessingController.pauseProcessing();
      sharedPropertyTree1.root.insert("array", PropertyFactory.create("test:namedEntry-1.0.0", "array"));
      sharedPropertyTree1.commit();

      // Make sure both shared trees are in sync
      await opProcessingController.ensureSynchronized();
    });
    afterEach(async () => {
      // We expect the internal representation to be the same between both properties
      expect((sharedPropertyTree1).remoteTipView).to.deep.equal(
        (sharedPropertyTree2).remoteTipView,
      );

      // We expect the property tree to be the same between both
      expect(sharedPropertyTree1.root.serialize()).to.deep.equal(sharedPropertyTree2.root.serialize());

      // We expect the property tree to correspond to the remote tip view
      expect((sharedPropertyTree1).remoteTipView).to.deep.equal(sharedPropertyTree2.root.serialize());

      // We expect all properties from the set to be present
      const array = sharedPropertyTree1.root.get("array");
      assert(array !== undefined, "property undefined");
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      for (const property of array.getValues()) {
        expect(!deletedProperties.has(property.guid)).to.be.true;
        expect(createdProperties.has(property.guid)).to.be.true;
        createdProperties.delete(property.guid);
      }
      expect(createdProperties.size).to.equal(0);
    });
    function insertProperties(tree, index, count = 1, commit = true) {
      for (let i = 0; i < count; i++) {
        const property = PropertyFactory.create("test:namedEntry-1.0.0");
        tree.root.get("array") !== undefined && tree.root.get("array").insert(index + i, property);
        createdProperties.add(property.getGuid());
      }

      if (commit) {
        tree.commit();
      }
    }
    function removeProperties(tree, index, count = 1, commit = true) {
      const array = tree.root.get("array");
      assert(array !== undefined, "property undefined");

      for (let i = 0; i < count; i++) {
        if (index >= array.getLength()) {
          break;
        }
        const property = array.get(index);
        assert(property !== undefined, "property undefined");
        array.remove(index);
        createdProperties.delete(property.getGuid());
        deletedProperties.add(property.getGuid());
      }
      if (commit) {
        tree.commit();
      }
    }

    it("inserting properties into both trees", async () => {
      insertProperties(sharedPropertyTree1, 0);
      insertProperties(sharedPropertyTree1, 1);
      insertProperties(sharedPropertyTree2, 0);
      insertProperties(sharedPropertyTree2, 1);
      await opProcessingController.ensureSynchronized();
    });

    it("inserting properties in one tree and deleting in the other", async () => {
      insertProperties(sharedPropertyTree1, 0);
      insertProperties(sharedPropertyTree1, 1);
      await opProcessingController.ensureSynchronized();
      removeProperties(sharedPropertyTree2, 0);
      removeProperties(sharedPropertyTree2, 0);
      await opProcessingController.ensureSynchronized();
    });

    it("inserting properties in one tree and deleting in both", async () => {
      insertProperties(sharedPropertyTree1, 0);
      insertProperties(sharedPropertyTree1, 1);
      await opProcessingController.ensureSynchronized();
      removeProperties(sharedPropertyTree1, 0);
      removeProperties(sharedPropertyTree2, 0);
      await opProcessingController.ensureSynchronized();
    });
    it("Multiple inserts in sequence in tree 1", async () => {
      insertProperties(sharedPropertyTree1, 0, 1, true);
      insertProperties(sharedPropertyTree1, 0, 1, true);
      insertProperties(sharedPropertyTree1, 1, 1, true);
      insertProperties(sharedPropertyTree2, 0, 1, true);

      await opProcessingController.ensureSynchronized();
    });

    describe("Random tests", () => {
      createRandomTests(
        [
          {
            getParameters: (random) => {
              const tree =
                random.irandom(2) === 0 ? () => sharedPropertyTree1 : () => sharedPropertyTree2;
              const array = tree().root.get("array");
              return {
                position: random.irandom(array.getLength()) || 0,
                count: (random.irandom(3)) + 1,
                tree,
              };
            },
            op: async (parameters) => {
              insertProperties(parameters.tree(), parameters.position, parameters.count, true);
            },
            probability: 1,
          },
          {
            getParameters: (random) => {
              const tree =
                random.irandom(2) === 0 ? () => sharedPropertyTree1 : () => sharedPropertyTree2;
              const array = tree().root.get("array");
              return {
                position: random.irandom(array.getLength()) || 0,
                count: (random.irandom(3)) + 1,
                tree,
              };
            },
            op: async (parameters) => {
              removeProperties(parameters.tree(), parameters.position, parameters.count, true);
            },
            probability: 1,
          },
          {
            getParameters: (random) => {
              const container = random.irandom(2) === 0 ? () => container1 : () => container2;
              return {
                container,
              };
            },
            op: async (parameters) => {
              await opProcessingController.processOutgoing(parameters.container());
            },
            probability: 1,
          },
          {
            getParameters: (random) => {
              const container = random.irandom(2) === 0 ? () => container1 : () => container2;
              return {
                container,
              };
            },
            op: async (parameters) => {
              await opProcessingController.processIncoming(parameters.container());
            },
            probability: 1,
          },
        ],
        async () => {
          await opProcessingController.ensureSynchronized();
        },
        1000,
        0,
        25,
      );
    });
    describe("Failed Random Tests", () => {
      it("Test Failure 1", async () => {
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 0, 3, true);
        insertProperties(sharedPropertyTree1, 3, 3, true);
        insertProperties(sharedPropertyTree1, 6, 2, true);
        insertProperties(sharedPropertyTree1, 0, 3, true);
        insertProperties(sharedPropertyTree1, 0, 2, true);
        insertProperties(sharedPropertyTree1, 2, 2, true);
        insertProperties(sharedPropertyTree1, 8, 2, true);
        insertProperties(sharedPropertyTree1, 2, 2, true);
        insertProperties(sharedPropertyTree1, 16, 3, true);
        insertProperties(sharedPropertyTree1, 9, 1, true);
        insertProperties(sharedPropertyTree1, 4, 2, true);
        insertProperties(sharedPropertyTree1, 13, 3, true);
        insertProperties(sharedPropertyTree1, 9, 3, true);
        insertProperties(sharedPropertyTree1, 16, 2, true);
        insertProperties(sharedPropertyTree1, 12, 2, true);
        insertProperties(sharedPropertyTree2, 0, 2, true);
        insertProperties(sharedPropertyTree1, 12, 2, true);
        insertProperties(sharedPropertyTree1, 12, 3, true);
        insertProperties(sharedPropertyTree1, 25, 3, true);
        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 2", async () => {
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 1, 1, true);
        insertProperties(sharedPropertyTree1, 1, 1, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 2, 1, true);
        insertProperties(sharedPropertyTree1, 4, 1, true);
        insertProperties(sharedPropertyTree1, 2, 1, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 6, 1, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 6, 1, true);
        insertProperties(sharedPropertyTree1, 9, 1, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 2, 1, true);
        insertProperties(sharedPropertyTree1, 9, 1, true);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        insertProperties(sharedPropertyTree1, 4, 1, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 3, 1, true);
        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 3", async () => {
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        insertProperties(sharedPropertyTree2, 0, 1, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 4", async () => {
        insertProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        insertProperties(sharedPropertyTree2, 1, 1, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 5", async () => {
        insertProperties(sharedPropertyTree1, 0, 8, true);
        removeProperties(sharedPropertyTree1, 4, 3, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 6", async () => {
        insertProperties(sharedPropertyTree1, 0, 2, true);
        removeProperties(sharedPropertyTree1, 0, 2, true);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        removeProperties(sharedPropertyTree2, 0, 1, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 7", async () => {
        insertProperties(sharedPropertyTree2, 0, 8, true);
        insertProperties(sharedPropertyTree1, 0, 2, true);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree1, 1, 4, true);
        await opProcessingController.processOutgoing(container1);
        removeProperties(sharedPropertyTree1, 4, 3, true);
        removeProperties(sharedPropertyTree1, 0, 2, true);
        insertProperties(sharedPropertyTree1, 0, 4, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 8", async () => {
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processIncoming(container1);
        removeProperties(sharedPropertyTree2, 0, 3, true);
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree1, 0, 1, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 9", async () => {
        insertProperties(sharedPropertyTree2, 0, 9, true);
        insertProperties(sharedPropertyTree2, 4, 1, true);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 1, 2, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 10", async () => {
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processIncoming(container1);
        removeProperties(sharedPropertyTree2, 0, 3, true);
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        removeProperties(sharedPropertyTree1, 0, 1, true);
        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 11", async () => {
        insertProperties(sharedPropertyTree2, 0, 6, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 4, 2, true);
        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 12", async () => {
        insertProperties(sharedPropertyTree1, 0, 2, true);
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processOutgoing(container2);
        removeProperties(sharedPropertyTree2, 2, 2, true);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 1, 2, true);
        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 13", async () => {
        insertProperties(sharedPropertyTree1, 0, 2, true);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 1, 3, true);
        removeProperties(sharedPropertyTree2, 4, 1, true);
        insertProperties(sharedPropertyTree2, 4, 3, true);
        insertProperties(sharedPropertyTree1, 1, 2, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 14", async () => {
        insertProperties(sharedPropertyTree1, 0, 1, true);
        await opProcessingController.processOutgoing(container1);
        insertProperties(sharedPropertyTree2, 0, 2, true);
        await opProcessingController.processIncoming(container2);
        removeProperties(sharedPropertyTree2, 0, 1, true);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 15", async () => {
        insertProperties(sharedPropertyTree2, 0, 1, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processIncoming(container1);
        insertProperties(sharedPropertyTree2, 0, 2, true);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree1, 0, 2, true);
        removeProperties(sharedPropertyTree1, 1, 3, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 16", async () => {
        insertProperties(sharedPropertyTree1, 0, 3, true);
        await opProcessingController.processOutgoing(container1);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        removeProperties(sharedPropertyTree2, 0, 1, true);
        removeProperties(sharedPropertyTree1, 0, 3, true);
        insertProperties(sharedPropertyTree1, 0, 3, true);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 2, 2, true);
        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 17", async () => {
        insertProperties(sharedPropertyTree1, 0, 3, true);
        await opProcessingController.processOutgoing(container1);
        insertProperties(sharedPropertyTree1, 2, 4, true);
        removeProperties(sharedPropertyTree1, 0, 3, true);
        removeProperties(sharedPropertyTree1, 1, 3, true);
        insertProperties(sharedPropertyTree1, 0, 2, true);

        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 1, 1, true);

        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 18", async () => {
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processIncoming(container1);
        removeProperties(sharedPropertyTree2, 0, 3, true);
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        removeProperties(sharedPropertyTree1, 1, 2, true);
        insertProperties(sharedPropertyTree1, 0, 1, true);

        await opProcessingController.ensureSynchronized();
      });
      it("Test Failure 19", async () => {
        insertProperties(sharedPropertyTree1, 0, 3, true);
        insertProperties(sharedPropertyTree2, 0, 1, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processIncoming(container2);
        removeProperties(sharedPropertyTree2, 1, 3, true);
        await opProcessingController.processOutgoing(container1);
        removeProperties(sharedPropertyTree1, 0, 1, true);
        insertProperties(sharedPropertyTree1, 0, 3, true);
        removeProperties(sharedPropertyTree2, 0, 2, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 20", async () => {
        insertProperties(sharedPropertyTree1, 0, 2, true);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree2, 0, 2, true);
        await opProcessingController.processOutgoing(container2);
        removeProperties(sharedPropertyTree2, 1, 3, true);
        await opProcessingController.processIncoming(container1);
        removeProperties(sharedPropertyTree1, 1, 3, true);
        insertProperties(sharedPropertyTree1, 1, 2, true);
        removeProperties(sharedPropertyTree2, 0, 1, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 21", async () => {
        insertProperties(sharedPropertyTree1, 0, 7, true);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree1, 4, 2, true);
        await opProcessingController.processOutgoing(container1);
        insertProperties(sharedPropertyTree2, 5, 1, true);
        removeProperties(sharedPropertyTree2, 6, 2, true);
        insertProperties(sharedPropertyTree1, 6, 1, true);
        removeProperties(sharedPropertyTree1, 8, 1, true);
        await opProcessingController.processOutgoing(container2);
        removeProperties(sharedPropertyTree1, 7, 2, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test Failure 22", async () => {
        await opProcessingController.processOutgoing(container1);
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processIncoming(container2);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 1, 2, true);
        removeProperties(sharedPropertyTree1, 0, 2, true);
        await opProcessingController.processOutgoing(container1);
        insertProperties(sharedPropertyTree1, 0, 1, true);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processIncoming(container1);
        insertProperties(sharedPropertyTree1, 5, 2, true);
        await opProcessingController.processIncoming(container1);
        await opProcessingController.processOutgoing(container2);
        removeProperties(sharedPropertyTree2, 1, 1, true);
        removeProperties(sharedPropertyTree1, 6, 2, true);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree1, 3, 2, true);
        await opProcessingController.processOutgoing(container2);
        removeProperties(sharedPropertyTree2, 2, 3, true);
        removeProperties(sharedPropertyTree1, 3, 2, true);
        insertProperties(sharedPropertyTree2, 1, 3, true);
        await opProcessingController.ensureSynchronized();
      });

      it("Test failure 23", async () => {
        insertProperties(sharedPropertyTree2, 0, 4, true);
        insertProperties(sharedPropertyTree1, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        insertProperties(sharedPropertyTree2, 1, 3, true);
        removeProperties(sharedPropertyTree2, 0, 2, true);
        await opProcessingController.ensureSynchronized();
      });

      it("Test failure 24", async () => {
        insertProperties(sharedPropertyTree2, 0, 6, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processIncoming(container1);
        removeProperties(sharedPropertyTree2, 4, 1, true);
        removeProperties(sharedPropertyTree1, 3, 3, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processIncoming(container1);
        removeProperties(sharedPropertyTree1, 2, 3, true);

        await opProcessingController.ensureSynchronized();
      });

      it("Test failure 25", async () => {
        insertProperties(sharedPropertyTree1, 0, 3, true);
        await opProcessingController.processOutgoing(container2);
        await opProcessingController.processOutgoing(container1);
        insertProperties(sharedPropertyTree2, 0, 3, true);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree2, 2, 1, true);
        removeProperties(sharedPropertyTree2, 0, 1, true);
        await opProcessingController.processOutgoing(container1);
        await opProcessingController.processIncoming(container2);
        insertProperties(sharedPropertyTree1, 1, 2, true);
        removeProperties(sharedPropertyTree2, 1, 2, true);
        await opProcessingController.processIncoming(container1);
        await opProcessingController.ensureSynchronized();
      });
    });
  });
});
