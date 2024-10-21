/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import CodeBlock from '@theme/CodeBlock';

import { FluidBundleLoader } from "@site/src/components/fluidBundleLoader";
import { HomePageSection } from '@site/src/components/homePageSection';

import "@site/src/css/howItWorksSection.css";
import ServiceSectionBG from '@site/static/images/liveCodeBG.png';

const code =
`import { SharedTree, TreeViewConfiguration, SchemaFactory, Tree } from "fluid-framework";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

const client = new TinyliciousClient();
const containerSchema = {
	initialObjects: { diceTree: SharedTree },
};

const root = document.getElementById("content");

// The string passed to the SchemaFactory should be unique
const sf = new SchemaFactory("fluidHelloWorldSample");

// Here we define an object we'll use in the schema, a Dice.
class Dice extends sf.object("Dice", {
	value: sf.number,
}) {}

// Here we define the tree schema, which has a single Dice object.
// We'll call viewWith() on the SharedTree using this schema, which will give us a tree view to work with.
const treeConfiguration = new TreeViewConfiguration({ schema: Dice });

const createNewDice = async () => {
	const { container } = await client.createContainer(containerSchema);
	const view = container.initialObjects.diceTree.viewWith(treeConfiguration);
	// Because we're creating a new document, the tree must be initialized with some data.
	// Doing this step before attaching is also a good idea as it ensures other clients will never see the
	// tree in an uninitialized state.
	view.initialize(new Dice({ value: 1 }));
	// Get the root node of the view, which contains the tree's data
	const dice = view.root;
	// Attaching the container gives it a backing file and makes it visible to other clients.
	const id = await container.attach();
	renderDiceRoller(dice, root);
	return id;
};

const loadExistingDice = async (id) => {
	const { container } = await client.getContainer(id, containerSchema);
	const dice = container.initialObjects.diceTree.viewWith(treeConfiguration).root;
	renderDiceRoller(dice, root);
};

async function start() {
	if (location.hash) {
		await loadExistingDice(location.hash.substring(1));
	} else {
		const id = await createNewDice();
		location.hash = id;
	}
}

start().catch((error) => console.error(error));

// Define the view
const template = document.createElement("template");

template.innerHTML = \`
<style>
	.wrapper { text-align: center }
	.dice { font-size: 200px }
	.roll { font-size: 50px;}
</style>
<div class="wrapper">
	<div class="dice"></div>
	<button class="roll"> Roll </button>
</div>
\`;

const renderDiceRoller = (dice, elem) => {
	elem.appendChild(template.content.cloneNode(true));

	const rollButton = elem.querySelector(".roll");
	const diceElem = elem.querySelector(".dice");

	// Set the value on the persisted Dice object to a random number between 1 and 6.
	rollButton.onclick = () => {
		dice.value = Math.floor(Math.random() * 6) + 1;
	};

	// Get the current value of the shared data to update the view whenever it changes.
	const updateDice = () => {
		const diceValue = dice.value;
		// Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
		diceElem.textContent = String.fromCodePoint(0x267f + diceValue);
		diceElem.style.color = \`hsl(\${diceValue * 60}, 70%, 30%)\`;
	};
	updateDice();

	// Use the afterChange event to trigger a rerender whenever the value changes.
	Tree.on(dice, "afterChange", updateDice);
	// Setting "fluidStarted" is just for our test automation
	window["fluidStarted"] = true;
};
`;

export function HowItWorksSection(): React.ReactElement {
	return <HomePageSection title="See how it works" subtitle="Open Source" image={ServiceSectionBG}>
		<div className="howItWorksSectionBody">
			<div className="howItWorksSectionCodeBody">
				<div className="howItWorksCodeColumn">
					<div className="howItWorksCodeColumnLabel">
						Sample Code
					</div>
					<div className="howItWorksCodeCard">
							<div className="howItWorksCodeCardBody">
								<CodeBlock
									language="typescript" className="howItWorksCodeCardText"
									showLineNumbers
								>
									{code}
								</CodeBlock>
							</div>
					</div>
				</div>
				<div className="howItWorksCodeColumn">
					<div className="howItWorksCodeColumnLabel">
						Sample Output
					</div>
					{/* TODO: these should be 2 separate cards, if possible. */}
					<div className="howItWorksCodeCard">
						{/* <div > */}
							<FluidBundleLoader idPrefix="dice-roller" bundleName="dice-roller.2021-09-24.js" className="howItWorksCodeCardBody"/>
						{/* </div> */}
					</div>
					{/* <div className="howItWorksCodeCard">
						<div className="howItWorksCodeCardBody">
							Bar
						</div>
					</div> */}
				</div>
			</div>
			<div className="howItWorksTryOtherSamplesButton">
				<div className="howItWorksTryOtherSamplesButtonFrame">
					<label className="howItWorksTryOtherSamplesButtonLabel">Try the other samples</label>
				</div>
			</div>
		</div>
	</HomePageSection>;
}
