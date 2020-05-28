import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { IDiceRoller } from "./model";

export class DiceRollerView implements IComponentHTMLView {
    constructor(private readonly model: IDiceRoller) { }

    public get IComponentHTMLView() { return this; }

    public render(div: HTMLElement) {
        const diceSpan = document.createElement("span");
        diceSpan.classList.add("diceSpan");
        diceSpan.style.fontSize = "50px";
        diceSpan.textContent = this.getDiceChar(this.model.value);
        div.appendChild(diceSpan);

        const rollButton = document.createElement("button");
        rollButton.classList.add("rollButton");
        rollButton.textContent = "Roll";
        rollButton.onclick = this.model.roll;
        div.appendChild(rollButton);

        // When the value of the dice changes we will re-render the
        // value in the dice span
        this.model.on("diceRolled", () => {
            diceSpan.textContent = this.getDiceChar(this.model.value);
        });
    }

    private getDiceChar(value: number) {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        return String.fromCodePoint(0x267F + value);
    }
}