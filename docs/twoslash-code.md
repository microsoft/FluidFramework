``` twoslash include view
export const diceValueKey = "dice-value-key";

export const jsRenderView = (diceMap, elem) => {

    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    elem.append(wrapperDiv);

    const dice = document.createElement("div");
    dice.style.fontSize = "200px";

    const rollButton = document.createElement("button");
    rollButton.style.fontSize = "50px";
    rollButton.textContent = "Roll";
    // Set the value at our dataKey with a random number between 1 and 6.
    rollButton.onclick = () => diceMap.set(diceValueKey, Math.floor(Math.random() * 6) + 1);

    wrapperDiv.append(dice, rollButton);

    // Get the current value of the shared data to update the view whenever it changes.
    const updateDice = () => {
        const diceValue = diceMap.get(diceValueKey);
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        dice.textContent = String.fromCodePoint(0x267f + diceValue);
        dice.style.color = `hsl(\${diceValue * 60}, 70%, 50%)`;
    };
    updateDice();

    // Use the changed event to trigger the rerender whenever the value changes.
    diceMap.on("valueChanged", updateDice);
}
```

```ts twoslash
// @filename: view.ts
// @include: view

// @filename: app.ts
// @allowJs
// @checkJs
import { SharedMap } from "fluid-framework";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { jsRenderView as renderDiceRoller } from "./view";

export const diceValueKey = "dice-value-key";

const client = new TinyliciousClient();
const containerSchema = {
    initialObjects: { diceMap: SharedMap }
};
const root = document.getElementById("content");

const createNewDice = async () => {
    const { container } = await client.createContainer(containerSchema);
    /*      ^?*/
    (container.initialObjects.diceMap as SharedMap).set(diceValueKey, 1);
    const id = container.attach();
    renderDiceRoller(container.initialObjects.diceMap, root);
    return id;
}

const loadExistingDice = async (id) => {
    const { container } = await client.getContainer(id, containerSchema);
    renderDiceRoller(container.initialObjects.diceMap, root);
}

async function start() {
    if (location.hash) {
        await loadExistingDice(location.hash.substring(1))
    } else {
        const id = await createNewDice();
        location.hash = id;
    }
}

start().catch((error) => console.error(error));
```
