/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IFluidClientDebugger, IFluidClientDebuggerEvents } from "@fluid-tools/client-debugger";

/**
 * {@link @fluid-tools/client-debugger#IFluidClientDebugger} implementation which listens to window
 * messages to populate its data and fire its own events.
 *
 * @remarks
 *
 * Messages are posted by the debugger instance on the client side.
 */
export class ExtensionDebugger
	extends TypedEventEmitter<IFluidClientDebuggerEvents>
	implements IFluidClientDebugger
{
	public constructor();
}
