import * as pragueClientApi from "@prague/client-api";
import { ICommit } from "@prague/gitresources";
import { IUser } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";
import { SharedStringForWord } from "./shared-string-for-word";

/**
 * IwordApi
 *
 * The main API interface made available to Word from the JS code
 */
export interface IWordApi {

    /**
     * openDocument
     *
     * Open this document, once its ready call the callback supplied
     */
    openDocument: (id: string, commit: ICommit) => Promise<pragueClientApi.Document>;

    /**
     * wrapSharedStringForWord
     *
     * Given a SharedString object, wrap it in a SharedStringForWord object and return it
     * @param sharedString the shared string object to wrap
     * @returns A SharedStringForWord
     */
    wrapSharedStringForWord: (sharedString: SharedString) => SharedStringForWord;
}

/**
 * Word api
 */
class WordApi implements IWordApi {
    /**
     * Open document of word api
     */
    public async openDocument(id: string, commit: ICommit = null): Promise<pragueClientApi.Document> {

        console.log("WordApi.openDocument");

        const { service, token, tenantId } = this.createDocumentServiceAndToken(id);
        const loadOptions = { blockUpdateMarkers: true };

        // If we are opening from a specific commit, then we do not want to connect to the deltamanager
        // If we did, then we would have ops rain down on top of the content that came from the commit
        // If we are opening from a commit, we don't want extra ops. We just want the commit.
        let connect = true;
        if (commit) {
            connect = false;
        }

        const tokenProvider = new socketStorage.TokenProvider(token);

        const collabDoc = await pragueClientApi.load(
            id,
            tenantId,
            tokenProvider,
            loadOptions,
            commit,
            connect,
            service);

        console.log("Opened document");
        const rootMap = collabDoc.getRoot();
        const rootView = await rootMap.getView();
        console.log("Keys");
        console.log(rootView.keys());

        if (!collabDoc.existing) {
            rootView.set("text", collabDoc.createString());
            rootView.set("presence", collabDoc.createMap());
            rootView.set("snapshots", collabDoc.createMap());
        }

        // Wait for main text to appear
        await rootView.wait("text");

        return collabDoc;
    }

    /**
     * Wrap shared string for word of word api
     */
    public wrapSharedStringForWord(sharedString: SharedString): SharedStringForWord {
            return new SharedStringForWord(sharedString);
    }

    /**
     * Creates a token
     * @param id The document id (i.e. filename)
     * @param tenantIdIn the tenant id
     * @param secretIn the secret
     * @returns token, a jwt-signed toekn
     */
    private createToken(id: string, tenantIdIn: string, secretIn: string, user: IUser): string {
        const payload = {
            documentId: id,
            permission: "read:write",
            tenantId: tenantIdIn,
            user,
        };

        return jwt.sign(payload, secretIn);
    }

    /**
     * Creates document service and token
     * @param id The document id (i.e. filename)
     * @returns a tuple with the document service and a token
     */
    private createDocumentServiceAndToken(id: string) {
        const useLocal: boolean = false;
        const useSPO: boolean = false;
        const usePrague: boolean = true;

        let routerlicious: string;
        let historian: string;
        let tenantId: string;
        let secret: string;

        const user: IUser = {
            id: "jisach",
        };

        if (useLocal) {
            routerlicious = "http://localhost:3000";
            historian = "http://localhost:3001";
            tenantId = "prague";
            secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
            console.log("Using local Prague service");
        } else if (usePrague) {
            routerlicious = "https://alfred.wu2.prague.office-int.com";
            historian = "https://historian.wu2.prague.office-int.com";
            tenantId = "awesome-knuth";
            secret = "5ad2ccdb911c9c3a5beb34965334edca";
            console.log("Using remote Prague service");
        } else if (useSPO) {
            console.log("Need SPO endpoint Urls");
            return;
        } else {
            console.log("Choice of document service APIs not specificed.");
            return;
        }

        // Register endpoint connection
        const documentService = socketStorage.createDocumentService(routerlicious, historian);
        const jwtToken = this.createToken(id, tenantId, secret, user);

        return { service: documentService, token: jwtToken, tenantId, user };
    }
}

/**
 * makeWordApi
 *
 * @returns a new instance of the word api
 */
export function makeWordApi(): IWordApi {
    return new WordApi();
}
