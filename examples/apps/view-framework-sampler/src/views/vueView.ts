/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Vue from "vue";
import { IDiceRoller } from "../dataObject";

/**
 * Render Dice into a given HTMLElement as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The HTMLElement to render into
 */
export function vueRenderDiceRoller(diceRoller: IDiceRoller, div: HTMLDivElement) {
    const app = new Vue({
        template: `
        <div style="font-size: 50px; text-align: center" >
            <div>Vue</div>
            <div v-bind:style="{ fontSize: '200px', color: diceColor }">
                {{diceCharacter}}
            </div>
            <button style="font-size: 50px;" v-on:click="rollDice">
                Roll
            </button>
        </div>`,
        data: () => ({ diceValue: diceRoller.value }),
        methods: {
            rollDice() {
                diceRoller.roll();
            },
            updateDiceValue() {
                this.diceValue = diceRoller.value;
            },
        },
        computed: {
            diceCharacter() {
                return String.fromCodePoint(0x267f + this.diceValue);
            },
            diceColor() {
                return `hsl(${this.diceValue * 60}, 70%, 50%)`;
            },
        },
        mounted() {
            diceRoller.on("diceRolled", (this as any).updateDiceValue);
        },
    });

    app.$mount(div);
}
