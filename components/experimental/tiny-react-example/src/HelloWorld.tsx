/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { useFluidState } from "@fluidframework/tiny-react";

/**
 * An example that uses useFluidState to modify the fluid map entry
 */
export function HelloWorld() {
    const [value, setValue] = useFluidState("hw-key", "hello");
    const handleClick = () => setValue(value === "hello" ? "world" : "hello");
    return <button onClick={handleClick}>{value}</button>;
}
