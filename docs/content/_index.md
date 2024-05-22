---
title: "Fluid Framework: Build performant real-time collaboration with ease"
aliases:
  - /playground/
summary: "An open-source client technology stack that enables real-time collaboration, provides developers with easy-to-understand data structures automatically keeps in sync between clients"
---

<div class="jumbotron text-center">
  <h1 class="display-4"><strong>Real-time. Multiuser. Collaboration.</strong></h1>
  <p class="lead">Empower collaborative innovation with Fluid Framework's seamless, high-performance tech stack for real-time applications.</p>
  <p><iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/uL2nMYk6WTQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></p>
  <p><a class="cta link-button get-started" style="background-color: #0066b8 !important; text-decoration: none;" href="/docs/start/quick-start/">Get started with Fluid Framework today!</a></p>
</div>

<div class="value-props">
    <h2><strong>Start building with Fluid Framework</strong></h2><br/>
    <div class="container">
        <div class="row">
            <div class="col-sm-4 col-xs-6">
                <a class="value-prop" id="home-value-prop-easy-to-use-link" href="#easy-to-use">
                    <div class="value-prop-icon easy-to-use"></div>
                    <b>Easy to use</b>
                </a>
            </div>
            <div class="col-sm-4 col-xs-6">
                <a class="value-prop" id="home-value-prop-open-source-link" href="#open-source">
                    <div class="value-prop-icon open-source"></div>
                    <b>Open source</b>
                </a>
            </div>
            <div class="col-sm-4 col-xs-6">
                <a class="value-prop" id="home-value-prop-open-source-link" href="#perf">
                    <div class="value-prop-icon better-perf"></div>
                    <b>Industry-leading</br>speed & performance</b>
                </a>
            </div>
        </div>
    </div>
</div>

{{<swimlane_container fullPage="yes">}}
<div class="swimlane customers">
    <div class="row text-center">
        <h2><strong>Who's using Fluid Framework</strong></h2>
    </div>
    <div class="row customers-list text-center">
        <div class="col-xs-6 col-sm-3 col-md-2">
            <div class="row">
                <img height="50" width="50" alt="Autodesk" src="images/Autodesk_logo.png">
            </div>
            <div class="row">
                <h3>Autodesk</h3>
            </div>
        </div>
        <div class="col-xs-6 col-sm-3 col-md-2">
            <div class="row">
                <img height="50" width="50" alt="Hexagon" src="images/Hexagon_logo.png">
            </div>
            <div class="row">
                <h3>Hexagon</h3>
            </div>
        </div>
        <div class="col-xs-6 col-sm-3 col-md-2">
            <div class="row">
                <svg width="50" height="50"><image xlink:href="images/Loop_logo.svg" width="50" height="50"></svg>
            </div>
            <div class="row">
                <h3>Microsoft Loop</h3>
            </div>
        </div>
        <div class="col-xs-6 col-sm-3 col-md-2">
            <div class="row">
                <svg width="50" height="50"><image xlink:href="images/Teams_logo.svg" width="50" height="50"></svg>
            </div>
            <div class="row">
                <h3>Microsoft Teams</h3>
            </div>
        </div>
        <div class="col-xs-6 col-sm-3 col-md-2">
            <div class="row">
                <img height="50" width="50" alt="PowerApps" src="images/PowerApps_logo.png">
            </div>
            <div class="row">
                <h3>Power Apps</h3>
            </div>
        </div>
        <div class="col-xs-6 col-sm-3 col-md-2">
            <div class="row">
                <img height="50" width="50" alt="Whiteboard" src="images/Whiteboard_logo.png">
            </div>
            <div class="row">
                <h3>Whiteboard</h3>
            </div>
        </div>
    </div>
</div>

{{</swimlane_container>}}

{{<swimlane_container fullPage="yes">}}
    {{<swimlane
        id="easy-to-use"
        title="Easy to use"
        subTitle="Transform your collaborative experience with our developer friendly framework - where simplicity meets powerful functionality effortlessly. The framework provides usability that drives innovation within Microsoft and across the industry by dramatically lowering the difficulty and cost of building innovative, collaborative software."
        img="/images/E1C1.svg"
        imgAlt="easy to use image"
      >}}
    {{<swimlane
        id="open-source"
        title="Open source"
        subTitle="We believe that an <strong>open, inclusive, and respectful </strong>community will help shape a better future for this project. That's why Fluid Framework is made available for <strong>FREE</strong> as an <strong>Open Source project</strong> under the MIT license."
        img="/images/1F513.svg"
        imgAlt="github logo"
        pos="right"
      >}}
    {{<swimlane
        id="perf"
        title="Industry-leading speed & performance"
        subTitle="Unleash unparalleled speed and performance with our cutting-edge solution for building real-time collaborative applications. Collaborative features are only successful if they are fast, scale to large data and user bases. Fluid offers an approachable programming model that leverages mainstream web technology while delivering best-in-class performance."
        img="/images/1F680.svg"
        imgAlt="speed and performance image"
      >}}
{{</swimlane_container>}}

{{<swimlane_container fullPage="no">}}
<div class="swimlane samplecode">
    <div class="row title">
        <div class="text-center">
            <h2><strong>See How It Works</strong></h2>
        </div>
        <div class="col-md-8 text-center">
            <h3>Sample Code</h3>
        </div>
        <div  class="col-md-4 text-center">
            <h3>Sample Output</h3>
        </div>
        <div class="col-md-8" style="text-left; height:650px; overflow-x: auto; padding-left: 50px;">
            <code>
                {{< highlight typescript >}}
                import { SharedTree, TreeConfiguration, SchemaFactory, Tree } from "fluid-framework";
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

                // Here we define the tree schema, which has a single Dice object starting at 1.
                // We'll call schematize() on the SharedTree using this schema, which will give us a tree view to work with.
                const treeConfiguration = new TreeConfiguration(
                    Dice,
                    () =>
                        new Dice({
                            value: 1,
                        }),
                );

                const createNewDice = async () => {
                    const { container } = await client.createContainer(containerSchema);
                    const dice = container.initialObjects.diceTree.schematize(treeConfiguration).root;
                    const id = await container.attach();
                    renderDiceRoller(dice, root);
                    return id;
                };

                const loadExistingDice = async (id) => {
                    const { container } = await client.getContainer(id, containerSchema);
                    const dice = container.initialObjects.diceTree.schematize(treeConfiguration).root;
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

                template.innerHTML = `
                <style>
                    .wrapper { text-align: center }
                    .dice { font-size: 200px }
                    .roll { font-size: 50px;}
                </style>
                <div class="wrapper">
                    <div class="dice"></div>
                    <button class="roll"> Roll </button>
                </div>
                `;

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
                        diceElem.style.color = `hsl(${diceValue * 60}, 70%, 30%)`;
                    };
                    updateDice();

                    // Use the afterChange event to trigger a rerender whenever the value changes.
                    Tree.on(dice, "afterChange", updateDice);
                    // Setting "fluidStarted" is just for our test automation
                    window["fluidStarted"] = true;
                };
                {{< / highlight >}}
            </code>
        </div>
    <div class="col-md-4 text-center" style="padding-right: 50px;">
        {{< fluid_bundle_loader idPrefix="dice-roller"
        bundleName="dice-roller.2021-09-24.js" >}}
    </div>
</div>
<div class="row">
    <div class="col-md-12 text-center">
        <p><br/><a class="cta link-button btn-info get-started" style="background-color: #17a2b8 !important; text-decoration: none;" href="/docs/start/examples/"><small>Try the other samples</small></a><br/><br/></p>
    </div>
</div>
</div>
{{</swimlane_container>}}

{{<swimlane_container fullPage="yes">}}
<div class="swimlane availableServices">
    <div class="container">
        <div class="row">
            <div class="row title" style="text-align: center;">
                <h2><strong>Fluid Framework in the Cloud</strong></h2>
            </div>
            <div class="row diagram text-center">
                <div class="row">
                    <div class="col-md-12">
                        <img height="450" width="850" alt="Architecture" src="images/FF Stack.png"><br/><br/><br/>
                    </div>
                </div>
            </div>
            <div class="row availableServices-list">
                <div class="availableServices">
                    <div class="container">
                        <div class="row">
                            <div class="col-md-6">
                                    <div>
                                        <svg width="50" height="50"><image xlink:href="images/azure.svg" width="50" height="50"></svg><br/>
                                        <h2>Azure Fluid Relay</h2>
                                    </div>
                                    <div>
                                        <p>Azure Fluid Relay is a cloud service that enables real-time collaboration on shared data models. It is a fully managed service that provides a secure, scalable, and reliable way to connect clients to each other and to the data models they share.</p>
                                    </div>
                                    <div>
                                        <a class="cta link-button btn-info get-started" style="background-color: #17a2b8 !important; text-decoration: none;" href="https://azure.microsoft.com/en-us/products/fluid-relay/#overview"><small>Learn more about Azure Fluid Relay</small></a>
                                    </div>
                            </div>
                            <div class="col-md-6">
                                    <div>
                                        <svg width="50" height="50"><image xlink:href="images/SharePoint_64x.svg" width="50" height="50"></svg><br/>
                                        <h2>SharePoint Embedded</h2>
                                    </div>
                                    <div>
                                        <p>Microsoft SharePoint Embedded is a cloud-based file and document management system suitable for use in any application. It is a new API-only solution which enables app developers to harness the power of the Microsoft 365 file and document storage platform for any app, and is suitable for enterprises building line of business applications and ISVs building multi-tenant applications.</p>
                                    </div>
                                    <div>
                                        <a class="cta link-button btn-info get-started" style="background-color: #17a2b8 !important; text-decoration: none;" href="https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview"><small>Learn more about SharePoint Embedded</small></a>
                                    </div>
                                </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
</div>
{{</swimlane_container>}}
