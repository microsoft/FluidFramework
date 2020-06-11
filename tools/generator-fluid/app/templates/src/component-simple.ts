import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

const diceValueKey = "diceValue";

/**
 * Fluid component
 */
export class DiceRoller extends PrimedComponent implements IComponentHTMLView {
    public static get ComponentName() { return "dice-roller"; }

    public get IComponentHTMLView() { return this; }

    /**
     * The factory defines how to create an instance of the component as well as the
     * dependencies of the component.
     */
    public static readonly factory = new PrimedComponentFactory(
        DiceRoller.ComponentName,
        DiceRoller,
        [],
        {},
    );

    /**
     * componentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        const getDiceChar = (): string => {
            return String.fromCodePoint(0x267F + this.root.get(diceValueKey));
        };
        const diceSpan = document.createElement("span");
        diceSpan.classList.add("diceSpan");
        diceSpan.style.fontSize = "50px";
        diceSpan.textContent = getDiceChar();
        div.appendChild(diceSpan);

        const rollButton = document.createElement("button");
        rollButton.classList.add("rollButton");
        rollButton.textContent = "Roll";
        rollButton.onclick = () => {
            const rollValue = Math.floor(Math.random() * 6) + 1;
            this.root.set(diceValueKey, rollValue);
        };
        div.appendChild(rollButton);

        // When the value of the dice changes we will re-render the
        // value in the dice span
        this.root.on("valueChanged", () => {
            diceSpan.textContent = getDiceChar();
        });
    }
}