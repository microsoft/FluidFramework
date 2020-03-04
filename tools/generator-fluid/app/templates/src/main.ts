import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";

/**
 * DiceRoller example using view interfaces and stock component classes.
 */
export class DiceRoller extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.root.set("diceValue", 1);

        // Uncomment the line below to add a title to your data schema!
        // this.root.set("title", "Initial Title Value");
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
            const diceSpan = div.querySelector(".diceSpan");
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
        diceSpan.classList.add("diceSpan");
        diceSpan.style.fontSize = "50px";
        diceSpan.textContent = this.getDiceChar(diceValue);
        host.appendChild(diceSpan);

        const rollButton = document.createElement("button");
        rollButton.classList.add("rollButton");
        rollButton.textContent = "Roll";
        rollButton.onclick = this.rollDice.bind(this);
        host.appendChild(rollButton);
    }

    private rollDice() {
        // tslint:disable-next-line:insecure-random - We don't need secure random numbers for this application.
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
