/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { APP_BASE_HREF } from "@angular/common";
import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { IComponentHTMLView, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { ISharedDirectory } from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    ComponentRegistryEntry,
} from "@microsoft/fluid-runtime-definitions";
import * as GraphiQL from "graphiql";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { AppModule } from "./app/app.module";
import { PRAGUE_PATH, PRAGUE_ROOT } from "./app/tokens";
import { GraphQLService } from "./app/hero.service";

export class TourOfHeroes extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    public get root(): ISharedDirectory {
        return super.root;
    }

    // Create the component's schema and perform other initialization tasks
    // (only called when document is initially created).
    protected async componentInitializingFirstTime() {
        const defaultHeroes = [
            { id: 11, name: "Mr. Nice" },
            { id: 12, name: "Narco" },
            { id: 13, name: "Bombasto" },
            { id: 14, name: "Celeritas" },
            { id: 15, name: "Magneta" },
            { id: 16, name: "RubberMan" },
            { id: 17, name: "Dynama" },
            { id: 18, name: "Dr IQ" },
            { id: 19, name: "Magma" },
            { id: 20, name: "Tornado" },
        ];

        // Seed the map with some heroes
        for (const hero of defaultHeroes) {
            this.root.set(`/heroes/${hero.id}`, hero.name);
        }
    }

    // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
    public render(elm: HTMLElement) {
        const maybeDiv = elm as HTMLDivElement;

        // Create root angular element
        const ngRoot = document.createElement("app-root");
        maybeDiv.appendChild(ngRoot);

        const pathname = parse(window.location.href).pathname;

        // And then bootstrap
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        platformBrowserDynamic(
            [
                { provide: APP_BASE_HREF, useValue: pathname },
                // eslint-disable-next-line no-null/no-null
                { provide: PRAGUE_PATH, useValue: null },
                { provide: PRAGUE_ROOT, useValue: this.root },
            ])
            .bootstrapModule(AppModule);
    }
}

class TourOfHeroesComponentView implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    public get id() {
        return this.path;
    }

    constructor(private readonly realComponent: TourOfHeroes, private readonly path: string) {
    }

    public render(elm: HTMLElement) {
        const maybeDiv = elm as HTMLDivElement;

        // Create root angular element
        const ngRoot = document.createElement("app-root");
        maybeDiv.appendChild(ngRoot);

        const pathname = parse(window.location.href).pathname.replace(this.path, "");

        // And then bootstrap
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        platformBrowserDynamic(
            [
                { provide: APP_BASE_HREF, useValue: pathname },
                { provide: PRAGUE_PATH, useValue: this.path },
                { provide: PRAGUE_ROOT, useValue: this.realComponent.root },
            ])
            .bootstrapModule(AppModule);
    }
}

// Note on defining components - snapshotting does not seem like it should be part of an IChaincodeComponent given
// these synthetic components don't need it. We may want this to just be "attach"
class GraphIQLView implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    public readonly id = "graphiql";

    constructor(private readonly realComponent: TourOfHeroes) {
    }

    public render(elm: HTMLElement) {
        const maybeDiv = elm as HTMLDivElement;

        maybeDiv.style.width = "100vw";
        maybeDiv.style.height = "100vh";

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const css = require("graphiql/graphiql.css");
        const styleTag = document.createElement("style");
        styleTag.innerText = css;
        document.head.appendChild(styleTag);

        const graphQLServer = new GraphQLService(this.realComponent.root);

        // eslint-disable-next-line @typescript-eslint/promise-function-async
        const graphQLFetcher = (graphQLParams) => graphQLServer.runQuery(graphQLParams.query, graphQLParams.variables);

        ReactDOM.render(
            React.createElement(
                GraphiQL,
                { fetcher: graphQLFetcher },
            ),
            maybeDiv,
        );

        return this;
    }
}

const TourOfHeroesType = "@chaincode/tourofheroes";
const TourOfHeroesInstantiationFactory = new PrimedComponentFactory(TourOfHeroesType, TourOfHeroes, []);
class TourOfHeroesContainerInstantiationFactory implements IRuntimeFactory, IComponentRegistry, IComponentFactory {
    public static readonly type = TourOfHeroesType;
    public readonly type = TourOfHeroesContainerInstantiationFactory.type;

    public get IComponentFactory() { return this; }
    public get IComponentRegistry() { return this; }
    public get IRuntimeFactory() { return this; }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public get(name: string): Promise<ComponentRegistryEntry> | undefined {
        if (name === TourOfHeroesType) {
            return Promise.resolve(TourOfHeroesInstantiationFactory);
        }
        return undefined;
    }

    public instantiateComponent(context: IComponentContext): void {
        TourOfHeroesInstantiationFactory.instantiateComponent(context);
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(context,
            [[TourOfHeroesType, Promise.resolve(TourOfHeroesInstantiationFactory)]],
            [TourOfHeroesContainerInstantiationFactory.containerRequestHandler],
            { generateSummaries: true });

        // On first boot create the base component
        if (!runtime.existing) {
            const componentRuntime = await runtime.createComponent("app", TourOfHeroesType);
            componentRuntime.attach();
        }

        return runtime;
    }

    private static async containerRequestHandler(request: IRequest, runtime: ContainerRuntime) {
        const componentRuntime = await runtime.getComponentRuntime("app", true);
        const tourOfHeroes = (await componentRuntime.request({ url: "/" })).value as TourOfHeroes;

        // Root entry we will use the full component. Otherwise we will proxy to a view
        if (!request.url) {
            return { status: 200, mimeType: "fluid/component", value: tourOfHeroes };
        } else if (request.url === "/graphiql") {
            return { status: 200, mimeType: "fluid/component", value: new GraphIQLView(tourOfHeroes) };
        } else {
            const view = new TourOfHeroesComponentView(tourOfHeroes, request.url);
            return { status: 200, mimeType: "fluid/component", value: view };
        }
    }
}

export const fluidExport = new TourOfHeroesContainerInstantiationFactory();
