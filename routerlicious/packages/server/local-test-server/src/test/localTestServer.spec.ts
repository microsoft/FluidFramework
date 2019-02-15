import * as api from "@prague/client-api";
import { MessageType } from "@prague/container-definitions";
import { SharedString } from "@prague/sequence";
import { generateToken } from "@prague/services-core";
import * as socketStorage from "@prague/socket-storage";
import * as assert from "assert";
import {
  createTestDocumentService,
  DocumentDeltaEventManager,
  ITestDeltaConnectionServer,
  TestDeltaConnectionServer,
} from "..";

describe.skip("LocalTestServer", () => {
  const id = "documentId";
  const tenantId = "tenantId";
  const tokenKey = "tokenKey";

  let testDeltaConnectionServer: ITestDeltaConnectionServer;
  let documentDeltaEventManager: DocumentDeltaEventManager;
  let user1Document: api.Document;
  let user2Document: api.Document;
  let user1SharedString: SharedString;
  let user2SharedString: SharedString;

  beforeEach(async () => {
    testDeltaConnectionServer = TestDeltaConnectionServer.Create();
    documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);

    const user1Token = generateToken(tenantId, id, tokenKey);
    const documentService = createTestDocumentService(testDeltaConnectionServer);
    user1Document = await api.load(
      id, tenantId, new socketStorage.TokenProvider(user1Token), {}, null, true, documentService);
    let root = user1Document.getRoot();
    user1SharedString = user1Document.createString();
    root.set("SharedString", user1SharedString);
    documentDeltaEventManager.registerDocuments(user1Document);

    const user2Token = generateToken(tenantId, id, tokenKey);
    user2Document = await api.load(
      id, tenantId, new socketStorage.TokenProvider(user2Token), {}, null, true, documentService);
    root = user2Document.getRoot();
    user2SharedString = await root.wait("SharedString") as SharedString;
    documentDeltaEventManager.registerDocuments(user2Document);
  });

  describe("Document.existing", () => {
      it("Validate document is new for user1 1 and exists for client 2", () => {
        assert.equal(user1Document.existing, false, "Document already exists");
        assert.equal(user2Document.existing, true, "Document does not exist on the server");
        assert.notEqual(user2SharedString, undefined, "Document does not contain a SharedString");
        });
    });

  describe("Attach Op Handlers on Both Clients", () => {
    it("Validate messaging", async () => {
      let user1ReceivedMsgCount: number = 0;
      let user2ReceivedMsgCount: number = 0;

      user1SharedString.on("op", (msg, local) => {
        if (!local) {
          if (msg.type === MessageType.Operation) {
            user1ReceivedMsgCount = user1ReceivedMsgCount + 1;
          }
        }
      });

      user2SharedString.on("op", (msg, local) => {
        if (!local) {
          if (msg.type === MessageType.Operation) {
            user2ReceivedMsgCount = user2ReceivedMsgCount + 1;
          }
        }
      });

      documentDeltaEventManager.pauseProcessing();

      user1SharedString.insertText("A", 0);
      user2SharedString.insertText("C", 0);
      assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
      assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

      await documentDeltaEventManager.processOutgoing(user1Document);
      assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
      assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

      await documentDeltaEventManager.process(user2Document);
      assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
      assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

      await documentDeltaEventManager.processIncoming(user1Document);
      assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
      assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

      user1SharedString.insertText("B", 0);
      await documentDeltaEventManager.process(user1Document, user2Document);

      assert.equal(user1SharedString.getText(), user2SharedString.getText());
      assert.equal(user1SharedString.getText().length, 3, user1SharedString.getText());
      assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
      assert.equal(user2ReceivedMsgCount, 2, "User2 received message count is incorrect");
    });
  });

  afterEach(async () => {
    user1Document.close();
    user2Document.close();
    await testDeltaConnectionServer.webSocketServer.close();
  });
});
