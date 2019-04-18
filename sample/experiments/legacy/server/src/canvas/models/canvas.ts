import { Promise } from "es6-promise";
import * as promisify from "es6-promisify";
import * as uuid from "node-uuid";
import * as collabClient from "../../collab/client";
import { Ink } from "./ink";

export interface IObject {
    id: string;

    type: string;

    location: {
        x: number;
        y: number;
    };

    width: number;
}

export interface ICanvas {
    ink: {
        id: string;
    };

    objects: IObject[];
}

export interface IShareDBModel<T> {
    data: T;

    on: Function;

    submitOp: Function;
}

export class Canvas {
    public static LoadOrCreate(connection, id: string, compose: boolean): Promise<Canvas> {
        // Load the model from the server
        let doc = connection.get("canvas", id);

        let subscribe = promisify(doc.subscribe, doc);
        let createDocument = promisify(doc.create, doc);

        let subscribeP: Promise<any> = subscribe();
        let docP = subscribeP.then(() => {
            if (!doc.type) {
                let inkP = Ink.GetOrCreate(connection, uuid.v4(), compose);
                return inkP.then((ink) => {
                    let initial: ICanvas = {
                        ink: {
                            id: ink.id,
                        },
                        objects: [],
                    };

                    return createDocument(initial, collabClient.types.json.type.name).then(() => doc);
                });
            }

            return doc;
        });

        return docP.then(() => {
            return new Canvas(connection, doc, compose);
        });
    }

    private inkLayerP: Promise<Ink>;

    public get data(): ICanvas {
        return this.model.data;
    }

    private constructor(private connection: any, private model: IShareDBModel<ICanvas>, compose: boolean) {
        // Listen for updates and then fetch the promises for the given types
        this.inkLayerP = Ink.GetOrCreate(connection, model.data.ink.id, compose);
    }

    public getInkLayer(): Promise<Ink> {
        return this.inkLayerP;
    }

    public on(operation: string, callback: Function) {
        this.model.on(operation, callback);
    }

    public submitOp(delta, params) {
        this.model.submitOp(delta, params);
    }
}
