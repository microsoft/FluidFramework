import { Promise } from "es6-promise";
import * as promisify from "es6-promisify";
import * as collabClient from "../../collab/client";

export class RichText {
    public static getOrCreate(connection, id): Promise<RichText> {
        // Load the model from the server
        let doc = connection.get("documents", id);

        let subscribe = promisify(doc.subscribe, doc);
        let createDocument = promisify(doc.create, doc);

        let subscribeP: Promise<any> = subscribe();
        let docP = subscribeP.then(() => {
            if (!doc.type) {
                return createDocument([], collabClient.types.richText.type.name).then(() => doc);
            }

            return doc;
        });

        return docP.then(() => {
            return new RichText(doc);
        });
    }

    public get id(): string {
        return this.model.id;
    }

    public get data(): any {
        return this.model.data;
    }

    private constructor(private model: any) {
        // TODO I should attach to the handlers as soon as possible
    }

    public on(operation: string, callback: Function) {
        this.model.on(operation, callback);
    }

    public submitOp(delta, params) {
        this.model.submitOp(delta, params);
    }
}
