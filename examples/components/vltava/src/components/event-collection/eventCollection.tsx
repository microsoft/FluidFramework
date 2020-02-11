/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import uuid from "uuid/v4";

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHTMLVisual,
    IRequest,
    IResponse,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    IComponentCollection,
    IComponentDiscoverableInterfaces,
} from "@microsoft/fluid-framework-interfaces";

interface IEventItemDataModel {
    url: string;
}

class EventItem implements IComponentHTMLVisual, IComponentLoadable {
    public get IComponentHTMLVisual() { return this; }
    public get IComponentLoadable() { return this; }

    public readonly url;

    constructor(eventItemDataModel: IEventItemDataModel) {
        this.url = eventItemDataModel.url;
    }

    /**
     * If someone just calls render they are not providing a scope and we just pass
     * undefined in.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>EventItem {this.url}</div>,
            div);
    }
}

/**
 * Event Collection is a collection component that holds Date/Time Events
 */
export class EventCollection extends PrimedComponent
    implements
        IComponentDiscoverableInterfaces,
        IComponentCollection
{
    private readonly loadedEventItems = new Map<string, EventItem>();


    private static readonly factory = new PrimedComponentFactory(EventCollection, []);

    public static getFactory() {
        return EventCollection.factory;
    }

    public get IComponentCollection() { return this; }

    public get IComponentDiscoverableInterfaces() { return this; }

    public get discoverableInterfaces(): (keyof IComponent)[] {
        return [];
    }

    public createCollectionItem<TOpt = object>(options?: TOpt): IComponent {
        const id = uuid();
        this.root.createSubDirectory(id);
        this.loadedEventItems.set(id, new EventItem({url: id}));
        return this.loadedEventItems.get(id);
    }

    public removeCollectionItem(instance: IComponent): void {
        const loadable = instance.IComponentLoadable;
        if (loadable) {
            this.loadedEventItems.delete(loadable.url);
            this.root.deleteSubDirectory(loadable.url);
        }
    }

    /**
     * Because this is a collection we will override the default request handling.
     * We currently don't want to return the collection itself but we want to return
     * the EventItems.
     */
    public async request(req: IRequest): Promise<IResponse> {
        if (req.url === "/" || req.url === this.url || req.url === "") {
            return {
                mimeType: "plain/text",
                status: 404,
                value: "Cannot request the collection directly",
            };
        }

        const reqParts = req.url.split("/");
        if(reqParts.length > 2) {
            return {
                mimeType: "plain/text",
                status: 404,
                value: `Cannot parse request url:[${req.url}]`,
            };
        }

        const eventItemId = reqParts[1];
        let eventItem = this.loadedEventItems.get(eventItemId);
        if (!eventItem) {
            const subDirectory = this.root.getSubDirectory(eventItemId);
            if (!subDirectory) {
                return {
                    mimeType: "plain/text",
                    status: 404,
                    value: `Event Item [${eventItemId}] doesn't exist in collection`,
                };
            }

            eventItem = new EventItem({url:eventItemId});
            this.loadedEventItems.set(eventItemId, eventItem);
        }

        return {
            mimeType: "fluid/component",
            status: 200,
            value: eventItem,
        };
    }
}
