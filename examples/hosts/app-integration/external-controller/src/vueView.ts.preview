/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createApp } from "vue";
import { IKeyValueDataObject } from "./kvpair-dataobject";

/**
 * Render Dice into a given HTMLElement as a text character, with a button to roll it.
 * @param dataObject - The Data Object to be rendered
 * @param div - The HTMLElement to render into
 */
export function renderDiceRoller(dataObject: IKeyValueDataObject, div: HTMLDivElement) {
    const app = createApp({
        template: `
        <div style="text-align: center" >
            <div v-bind:style="{ fontSize: '200px', color: diceColor }">
                {{diceCharacter}}
            </div>
            <button style="font-size: 50px;" v-on:click="rollDice">
                Roll
            </button>
        </div>`,
        data: () => (
            { diceValue: 1 }
        ),
        computed:{
            diceCharacter() {
                return String.fromCodePoint(0x267F + (this.diceValue as number));
            },
            diceColor() {
                return `hsl(${this.diceValue * 60}, 70%, 50%)`;
            },
        },
        methods: {
            rollDice() {
                dataObject.set("dice", Math.floor(Math.random() * 6) + 1);
            },
            syncLocalAndFluidState() {
                this.diceValue = dataObject.get("dice");
            },
        },
        mounted() {
            dataObject.on("changed", this.syncLocalAndFluidState);
        },
        unmounted() {
            dataObject.off("changed", this.syncLocalAndFluidState);
        },
      });

    app.mount(div);
}
