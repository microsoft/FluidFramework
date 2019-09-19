/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@prague/aqueduct";
import {
    IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
    Counter,
    CounterValueType,
} from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

        /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time your component
     * is created. Anything that happens in componentInitializingFirstTime will happen before any other user will see the component.
     */
    protected async componentInitializingFirstTime() {
        this.root.createValueType("clicks", CounterValueType.Name, 0);

        // Uncomment the line below to add a title to your data schema!
        /*
        this.root.set("title", "Initial Title Value");
        */
    }

    /**
     * Static load function that allows us to make async calls while creating our object.
     * This becomes the standard practice for creating components in the new world.
     * Using a static allows us to have async calls in class creation that you can't have in a constructor
     */
    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Clicker> {
        const clicker = new Clicker(runtime, context);
        await clicker.initialize();

        return clicker;
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        const counter = this.root.get<Counter>("clicks");

        // Do initial setup off the provided div.
        this.createComponentDom(div);

        // When the value of the counter is incremented we will reRender the
        // value in the counter span
        counter.on("incremented", () => {
            // Uncomment the block below to live update your title
            /*
            const title = this.root.get("title");
            const titleParagraph = document.getElementById("titleParagraph");
            titleParagraph.textContent = title;
            */

         const counterSpan = document.getElementById("counterSpan");
         counterSpan.textContent = counter.value.toString();
        });
    }

    private createComponentDom(host: HTMLElement) {

        const counter = this.root.get<Counter>("clicks");

        // Uncomment the block below to create a title in your components DOM
        /*
        const titleParagraph = document.createElement("p");
        titleParagraph.id = "titleParagraph";
        host.appendChild(titleParagraph);

        const titleInput = document.createElement("input");
        titleInput.id = "titleInput";
        titleInput.type = "text";
        titleInput.oninput = ( e) => { this.root.set("title", (e.target as any).value) };
        host.appendChild(titleInput);
        */

        const counterSpan = document.createElement("span");
        counterSpan.id = "counterSpan";
        counterSpan.textContent = counter.value.toString();
        host.appendChild(counterSpan);

        const counterButton = document.createElement("button");
        counterButton.id = "counterButton";
        counterButton.textContent = "+";
        counterButton.onclick = () => counter.increment(1);
        host.appendChild(counterButton);
    }
}

/**
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    Clicker,
    [],
);
