/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
    IComponentHTMLVisual,
    IComponent,
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { SharedDirectory, IDirectory } from "@microsoft/fluid-map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { initializeIcons } from "@uifabric/icons";
import { PersonaView } from "./personaView";

export class Persona extends EventEmitter implements
    IComponentLoadable,
    IComponentRouter,
    IComponentHTMLVisual {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new Persona(runtime, context);
        await collection.initialize();

        return collection;
    }

    private static readonly subDirectory = "persona";

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    private details: IDirectory;
    private readonly views = new Set<PersonaView>();

    constructor(private readonly runtime: IComponentRuntime, private readonly context: IComponentContext) {
        super();

        this.url = context.id;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        // Create the schema for the persona on first load
        if (!this.runtime.existing) {
            const graph = (this.context.scope as any).IMicrosoftGraph;
            const me = graph ? await graph.me() : {};

            // eslint-disable-next-line no-shadow
            const root = SharedDirectory.create(this.runtime, "root");
            const subdirectory = root.createSubDirectory(Persona.subDirectory);
            this.updateMe(me, subdirectory);
            root.register();
        }

        const root = await this.runtime.getChannel("root") as SharedDirectory;
        this.details = root.getSubDirectory(Persona.subDirectory);

        // If existing we do an update check
        if (this.runtime.existing) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.fetchAndUpdateMe();
        }
    }

    private async fetchAndUpdateMe() {
        const graph = (this.context.scope as any).IMicrosoftGraph;
        const me = graph ? await graph.me() : {};

        if (me.id !== this.details.get("id")) {
            return;
        }

        if (!this.runtime.connected) {
            await new Promise((resolve) => this.runtime.once("connected", resolve));
        }
        this.updateMe(me, this.details);
    }

    private updateMe(me: object, directory: IDirectory) {
        Object.keys(me).forEach((key) => {
            directory.set(key, me[key]);
        });
    }

    public addView(scope?: IComponent): IComponentHTMLView {
        const view = new PersonaView(
            this.details,
            () => this.views.delete(view));

        this.views.add(view);

        return view;
    }
}

class PersonaFactory implements IComponentFactory {
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext) {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const directoryFactory = SharedDirectory.getFactory();
        const sequenceFactory = SharedString.getFactory();

        dataTypes.set(directoryFactory.type, directoryFactory);
        dataTypes.set(sequenceFactory.type, sequenceFactory);

        initializeIcons();

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const progressCollectionP = Persona.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });

        return runtime;
    }
}

export const fluidExport = new PersonaFactory();
