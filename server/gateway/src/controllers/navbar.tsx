/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mergeStyles } from "office-ui-fabric-react";
// eslint-disable-next-line import/no-internal-modules
import { IPersonaSharedProps, Persona, PersonaInitialsColor, PersonaSize } from "office-ui-fabric-react/lib/Persona";
import * as React from "react";
import * as ReactDOM from "react-dom";

interface IGatewayUser {
    name: string;
}

export function initialize(user: IGatewayUser) {
    const examplePersona: IPersonaSharedProps = {
        text: user.name,
        hidePersonaDetails: true,
    };

    // Inject some global styles
    mergeStyles({
        selectors: {
            ":global(body), :global(html), :global(#app)": {
                margin: 0,
                padding: 0,
                height: "100vh",
            },
        },
    });

    ReactDOM.render(
        <Persona {...examplePersona} initialsColor={PersonaInitialsColor.lightBlue} size={PersonaSize.size32} />,
        document.getElementById("fluid-user"));
}
