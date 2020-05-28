import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IValueChanged } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { IDiceRoller } from "./model";
import { DiceRollerView } from "./view";

const diceValueKey = "diceValue";

/**
 * The DiceRoller is our implementation of the IDiceRoller interface.
 */
export class DiceRoller extends PrimedComponent implements IDiceRoller, IComponentHTMLView {
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
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === diceValueKey) {
                this.emit("diceRolled");
            }
        });
    }

    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        const view = new DiceRollerView(this);
        view.render(div);
    }

    public get value() {
        return this.root.get(diceValueKey);
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };
}
