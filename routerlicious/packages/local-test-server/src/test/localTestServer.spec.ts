import { OperationType } from "@prague/api-definitions";
import * as api from "@prague/client-api";
// tslint:disable-next-line:no-submodule-imports
import * as utils from "@prague/routerlicious/dist/utils";
import { SharedString } from "@prague/shared-string";
import * as socketStorage from "@prague/socket-storage";
import * as assert from "assert";
import { createTestDocumentService } from "../registration";
import { TestDeltaConnectionServer } from "../testDeltaConnectionServer";

describe("LocalTestServer", () => {
  const id = "documentId";
  const tenatId = "tenantId";
  const tokenKey = "tokenLey";

  let testDeltaConnectionServer: TestDeltaConnectionServer;
  let user1Document: api.Document;
  let user2Document: api.Document;
  let user1SharedString: SharedString;
  let user2SharedString: SharedString;

  before(() => {
    testDeltaConnectionServer = TestDeltaConnectionServer.Create();
  });

  describe("Load Document on Client1", () => {
    describe("Create SharedString", () => {
      before(async () => {
        const token = utils.generateToken(tenatId, id, tokenKey);
        const documentService = createTestDocumentService(testDeltaConnectionServer);
        const tokenProvider = new socketStorage.TokenProvider(token);
        user1Document = await api.load(id, tenatId, undefined, tokenProvider, {}, null, true, documentService);
        const rootView = await user1Document.getRoot().getView();
        user1SharedString = user1Document.createString();
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        rootView.set("SharedString", user1SharedString);
      });

      it("Validate document is new", () => {
        assert.equal(user1Document.existing, false, "Document already exists");
      });
    });
  });

  describe("Load Document on Client2", () => {
    before(async () => {
      const token = utils.generateToken(tenatId, id, tokenKey);
      const documentService = createTestDocumentService(testDeltaConnectionServer);
      const tokenProvider = new socketStorage.TokenProvider(token);
      user2Document = await api.load(id, tenatId, undefined, tokenProvider, {}, null, true, documentService);
      const rootView = await user2Document.getRoot().getView();
      user2SharedString = await rootView.wait("SharedString") as SharedString;
    });

    it("Validate document and SharedString exist", () => {
      assert.equal(user2Document.existing, true, "Document does not exist on the server");
      assert.notEqual(user2SharedString, undefined, "Document does not contain a SharedString");
    });
  });

  describe("Attach Op Handlers on Both Clients", () => {
    let user1ReceivedMsgCount: number = 0;
    let user2ReceivedMsgCount: number = 0;

    before(() => {
      user1SharedString.on("op", (msg, local) => {
        if (!local) {
          if (msg.type === OperationType) {
            user1ReceivedMsgCount = user1ReceivedMsgCount + 1;
          }
        }
      });

      user2SharedString.on("op", (msg, local) => {
        if (!local) {
          if (msg.type === OperationType) {
            user2ReceivedMsgCount = user2ReceivedMsgCount + 1;
          }
        }
      });

      user1SharedString.insertText("A", 0);
      user1SharedString.insertText("B", 1);
      user2SharedString.insertText("C", 2);
    });

    it("Validate messaging", () => {
      return new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 2, "User2 received message count is incorrect");
            resolve();
          },
          1000);
      });
    });
  });

  after(async () => {
    user1Document.close();
    user2Document.close();
    await testDeltaConnectionServer.webSocketServer.close();
  });
});
