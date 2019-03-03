import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";
import { AppModule } from './app/app.module';

export class tourofheroes extends Document {
    // Create the component's schema and perform other initialization tasks
    // (only called when document is initially created).
    protected async create() {
        this.root.set("clicks", 0, CounterValueType.Name);
    }

    protected render(host: HTMLDivElement, counter: Counter) {
    }

    // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
    public async opened() {
        // If the host provided a <div>, render the component into that Div
        const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
        if (!maybeDiv) {
            return;
        }

        // Create root angular element
        const ngRoot = document.createElement("app-root");
        maybeDiv.appendChild(ngRoot);

        // And then bootstrap
        platformBrowserDynamic().bootstrapModule(AppModule);
    }
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, "@chaincode/tourofheroes", [
        ["@chaincode/tourofheroes", tourofheroes]
    ]);
}
