/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script represents the root view for the Devtools extension.
 * It establishes communication with the Background Service as a relay for communication with the webpage (tab),
 * and passes that communication context (see {@link BackgroundConnection}) as the
 * {@link @fluid-experimental/devtools-core-view#MessageRelayContext} used by our internal React components.
 */

import { initializeDevtoolsView } from "./InitializeView";

document.body.style.margin = "0px";

const container = document.createElement("div");
container.style.position = "absolute";
container.style.height = "100%";
container.style.width = "100%";

document.body.append(container);

// eslint-disable-next-line unicorn/prefer-top-level-await
initializeDevtoolsView(container).then(() => {}, console.error);
