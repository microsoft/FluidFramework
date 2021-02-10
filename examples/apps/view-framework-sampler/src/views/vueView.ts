// /*!
//  * Copyright (c) Microsoft Corporation. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { createApp } from 'vue';
// import { IDiceRoller } from '../dataObject';

// /**
//  * Render Dice into a given HTMLElement as a text character, with a button to roll it.
//  * @param diceRoller - The Data Object to be rendered
//  * @param div - The HTMLElement to render into
//  */
// export function vueRenderDiceRoller(diceRoller: IDiceRoller, div: HTMLDivElement) {
//     const app = createApp({
//         template: `
//         <div style="text-align: center" >
//             <div v-bind:style="{ fontSize: '200px', color: diceColor }">
//                 {{diceCharacter}}
//             </div>
//             <button style="font-size: 50px;" v-on:click="rollDice">
//                 Roll
//             </button>
//         </div>`,
//         data: () => ({ diceValue: 1 }),
//         computed: {
//             diceCharacter() {
//                 return String.fromCodePoint(0x267f + (this.diceValue as number));
//             },
//             diceColor() {
//                 return `hsl(${this.diceValue * 60}, 70%, 50%)`;
//             },
//         },
//         methods: {
//             rollDice() {
//                 diceRoller.roll();
//             },
//             syncLocalAndFluidState() {
//                 this.diceValue = diceRoller.value;
//             },
//         },
//         mounted() {
//             diceRoller.on("diceRolled", this.syncLocalAndFluidState);
//         },
//         unmounted() {
//             diceRoller.off("diceRolled", this.syncLocalAndFluidState);
//         },
//     });

//     app.mount(div);
// }
