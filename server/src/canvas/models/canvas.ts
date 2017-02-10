import { Promise } from "es6-promise";
import * as promisify from "es6-promisify";
import * as uuid from "node-uuid";
import * as collabClient from "../../collab/client";
import { Ink } from "./ink";

export interface ICanvas {
    ink: {
        id: string;
    };

    objects: any[];
}

export interface IShareDBModel<T> {
    data: T;
}

export class Canvas {
    public static LoadOrCreate(connection, id: string): Promise<Canvas> {
        // Load the model from the server
        let doc = connection.get("canvas", id);

        let subscribe = promisify(doc.subscribe, doc);
        let createDocument = promisify(doc.create, doc);

        let subscribeP: Promise<any> = subscribe();
        let docP = subscribeP.then(() => {
            if (!doc.type) {
                let inkP = Ink.GetOrCreate(connection, uuid.v4());
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
            return new Canvas(connection, doc);
        });
    }

    private inkLayerP: Promise<Ink>;

    private constructor(private connection: any, private model: IShareDBModel<ICanvas>) {
        // Listen for updates and then fetch the promises for the given types
        this.inkLayerP = Ink.GetOrCreate(connection, model.data.ink.id);
    }

    public getInkLayer(): Promise<Ink> {
        return this.inkLayerP;
    }

    /**
     * Adds a new object to the list of canvas objects
     */
    public addObject(): any {
    }
}
