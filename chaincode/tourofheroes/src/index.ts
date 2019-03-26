import { APP_BASE_HREF } from '@angular/common';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Document } from "@prague/app-component";
import { IContainerContext, IRuntime, IRequest, ITree, IPlatform } from "@prague/container-definitions";
import { ISharedMap } from '@prague/map';
import { Runtime } from "@prague/runtime";
import { IChaincodeComponent, IComponentDeltaHandler, IComponentRuntime } from '@prague/runtime-definitions';
import { EventEmitter } from "events";
import { parse } from "url";
import { AppModule } from './app/app.module';
import { PRAGUE_PATH, PRAGUE_ROOT } from "./app/tokens";

class ViewPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
    
    public async detach() {
        return;
    }
}

export class TourOfHeroes extends Document {
    // Create the component's schema and perform other initialization tasks
    // (only called when document is initially created).
    protected async create() {
        const defaultHeroes = [
            { id: 11, name: 'Mr. Nice' },
            { id: 12, name: 'Narco' },
            { id: 13, name: 'Bombasto' },
            { id: 14, name: 'Celeritas' },
            { id: 15, name: 'Magneta' },
            { id: 16, name: 'RubberMan' },
            { id: 17, name: 'Dynama' },
            { id: 18, name: 'Dr IQ' },
            { id: 19, name: 'Magma' },
            { id: 20, name: 'Tornado' }
        ];

        // Seed the map with some heroes
        for (const hero of defaultHeroes) {
            this.root.set(`/heroes/${hero.id}`, hero.name);
        }
    }

    public getRoot(): ISharedMap {
        return this.root;
    }

    // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
    public async opened() {
        await this.connected;

        // If the host provided a <div>, render the component into that Div
        const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
        if (!maybeDiv) {
            return;
        }

        // Create root angular element
        const ngRoot = document.createElement("app-root");
        maybeDiv.appendChild(ngRoot);
        
        const pathname = parse(window.location.href).pathname

        // And then bootstrap
        platformBrowserDynamic(
            [
                { provide: APP_BASE_HREF, useValue: pathname },
                { provide: PRAGUE_PATH, useValue: null },
                { provide: PRAGUE_ROOT, useValue: this.root },
            ])
            .bootstrapModule(AppModule)
    }
}

class TourOfHeroesComponentView extends EventEmitter implements IChaincodeComponent, IPlatform {
    constructor(private realComponent: TourOfHeroes, private path: string) {
        super();
    }

    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }

    public async detach() {
        return;
    }

    public async close(): Promise<void> {
        return;
    }
    
    public run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        throw new Error("This is a runtime component and should not be run directly");
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        // To get the base component to fully initialize we attach (so opened is called) and then await the
        // component interface to make sure it has been fully created.
        // TODO should be an easier and cleaner way to do this
        const realPlatform = await this.realComponent.attach(new ViewPlatform());
        await realPlatform.queryInterface("component");

        this.renderPath(platform);
        return this;
    }

    public snapshot(): ITree {
        throw new Error("This is a runtime component and should not be snapshot");
    }

    private async renderPath(platform: IPlatform) {
        // If the host provided a <div>, render the component into that Div
        const maybeDiv = await platform.queryInterface<HTMLDivElement>("div");
        if (!maybeDiv) {
            return;
        }

        // Create root angular element
        const ngRoot = document.createElement("app-root");
        maybeDiv.appendChild(ngRoot);

        const pathname = parse(window.location.href).pathname.replace(this.path, "");

        // And then bootstrap
        platformBrowserDynamic(
            [
                { provide: APP_BASE_HREF, useValue: pathname },
                { provide: PRAGUE_PATH, useValue: this.path },
                { provide: PRAGUE_ROOT, useValue: this.realComponent.getRoot() },
            ])
            .bootstrapModule(AppModule)
    }
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, any>([
        [
            "@chaincode/tourofheroes",
            { instantiateComponent: () => Promise.resolve(new TourOfHeroes()) }
        ],
    ]);

    const runtime = await Runtime.Load(registry, context);

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        const component = await runtime.getComponent("app", true);

        // Root entry we will use the full component. Otherwise we will proxy to a view
        if (!request.url) {
            return { status: 200, mimeType: "prague/component", value: component };
        } else {
            const tourOfHeroes = component.chaincode as TourOfHeroes;
            const view = new TourOfHeroesComponentView(tourOfHeroes, request.url);
            return { status: 200, mimeType: "prague/component", value: view };
        }
    });

    runtime.registerTasks(["snapshot"]);

    // On first boot create the base component
    if (!runtime.existing) {
        runtime.createAndAttachComponent("app", "@chaincode/tourofheroes").catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
