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
import { IPackageManager } from "@microsoft/fluid-host-service-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
// eslint-disable-next-line import/no-extraneous-dependencies
import { initializeIcons } from "@uifabric/icons";
import * as semver from "semver";
import { DrawerView } from "./drawerView";

export class Drawer extends EventEmitter implements
    IComponentLoadable,
    IComponentRouter,
    IComponentHTMLVisual {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new Drawer(runtime, context);
        await collection.initialize();

        return collection;
    }

    private static readonly packages = [
        { pkg: "@fluid-example/drawer", name: "Folder", version: "latest", icon: "FabricNewFolder" },
        { pkg: "@fluid-example/shared-text", name: "Shared Text", version: "^0.10.0", icon: "TextDocument" },
        { pkg: "@fluid-example/flow-scroll", name: "Web Flow", version: "^0.10.0", icon: "WebComponents" },
        { pkg: "@fluid-example/prosemirror", name: "ProseMirror", version: "latest", icon: "WebComponents" },
        { pkg: "@fluid-example/smde", name: "Markdown", version: "latest", icon: "MarkDownLanguage" },
        { pkg: "@fluid-example/monaco", name: "Monaco", version: "^0.10.0", icon: "Code" },
        { pkg: "@fluid-example/codemirror", name: "CodeMirror", version: "latest", icon: "Code" },
        { pkg: "@fluid-example/table-view", name: "Table", version: "^0.10.0", icon: "Table" },
    ];

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    private root: ISharedMap;
    private readonly views = new Set<DrawerView>();
    private packageManager: IPackageManager;
    private packagesP: Promise<{ pkg: string; name: string; version: string; icon: string }[]>;

    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly context: IComponentContext,
    ) {
        super();

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.context.clientId;

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
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;

        this.packageManager = this.context.scope.IPackageManager;
        this.packagesP = this.packageManager
            ? this.fetchPackageData()
            : Promise.resolve([]);
    }

    private async fetchPackageData() {
        const latest = await Promise.all(Drawer.packages.map(async (value) => {
            if (value.version === "latest") {
                return this.packageManager.getVersion(value.pkg, value.version);
            }

            const packument = await this.packageManager.get(value.pkg);
            const versions = Object.keys(packument.versions);
            const max = semver.maxSatisfying(versions, value.version);

            return packument.versions[max];
        }));

        return latest.map((value, index) => ({
            pkg: value.name,
            name: Drawer.packages[index].name,
            version: value.version,
            icon: Drawer.packages[index].icon,
        }));
    }

    public addView(scope?: IComponent): IComponentHTMLView {
        const view = new DrawerView(
            this.context.scope.IDocumentFactory,
            this.root,
            this.context,
            this.packagesP,
            () => this.views.delete(view));
        this.views.add(view);

        return view;
    }
}

class DrawerFactory implements IComponentFactory {
    public static readonly type = "@fluid-example/drawer";
    public readonly type = DrawerFactory.type;

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        const sequenceFactory = SharedString.getFactory();

        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(sequenceFactory.type, sequenceFactory);

        initializeIcons();

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const progressCollectionP = Drawer.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });
    }
}

export const fluidExport = new DrawerFactory();
