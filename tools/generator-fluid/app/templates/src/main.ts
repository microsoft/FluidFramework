/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentContext,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";

/**
 * DiceRoller example using view interfaces and stock component classes.
 */
export class DiceRoller extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first
     * time your component is created. Anything that happens in componentInitializingFirstTime will happen before
     * any other user will see the component.
     */
    protected async componentInitializingFirstTime() {
        this.root.set("diceValue", 1);

        // Uncomment the line below to add a title to your data schema!
        // this.root.set("title", "Initial Title Value");
    }

    /**
     * Static load function that allows us to make async calls while creating our object.
     * This becomes the standard practice for creating components in the new world.
     * Using a static allows us to have async calls in class creation that you can't have in a constructor
     */
    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<DiceRoller> {
        const diceRoller = new DiceRoller(runtime, context);
        await diceRoller.initialize();

        return diceRoller;
    }

    /**
     * Render the DiceRoller
     */
    public render(div: HTMLElement) {
        // Do initial setup off the provided div.
        this.createComponentDom(div);

        // When the value of the dice changes we will re-render the
        // value in the dice span
        this.root.on("valueChanged", () => {
            // Uncomment the block below to live update your title
            // const title = this.root.get("title");
            // const titleParagraph = document.getElementById("titleParagraph");
            // titleParagraph.textContent = title;

            const diceValue = this.root.get<number>("diceValue");
            const diceSpan = document.getElementById("diceSpan");
            diceSpan.textContent = this.getDiceChar(diceValue);
        });
    }

    private createComponentDom(host: HTMLElement) {

        const diceValue = this.root.get<number>("diceValue");

        // Uncomment the block below to create a title in your components DOM
        // const titleParagraph = document.createElement("p");
        // titleParagraph.id = "titleParagraph";
        // host.appendChild(titleParagraph);

        // const titleInput = document.createElement("input");
        // titleInput.id = "titleInput";
        // titleInput.type = "text";
        // titleInput.oninput = ( e) => { this.root.set("title", (e.target as any).value) };
        // host.appendChild(titleInput);

        const diceSpan = document.createElement("span");
        diceSpan.id = "diceSpan";
        diceSpan.style.fontSize = "50px";
        diceSpan.textContent = this.getDiceChar(diceValue);
        host.appendChild(diceSpan);

        const rollButton = document.createElement("button");
        rollButton.id = "rollButton";
        rollButton.textContent = "Roll";
        rollButton.onclick = this.rollDice.bind(this);
        host.appendChild(rollButton);
    }

    private rollDice() {
        // tslint:disable-next-line:insecure-random
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set("diceValue", rollValue);
    }

    private getDiceChar(value: number) {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        return String.fromCodePoint(0x267F + value);
    }
}

/**
 * This is where you define all your Distributed Data Structures
 */
export const DiceRollerInstantiationFactory = new PrimedComponentFactory(
    DiceRoller,
    [],
);
