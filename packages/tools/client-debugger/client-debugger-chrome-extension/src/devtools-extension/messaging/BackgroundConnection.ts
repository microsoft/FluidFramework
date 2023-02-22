/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IMessageReceiverEvents, IMessageRelay, TypedPortConnection } from "../../messaging";
import {
	IDebuggerMessage,
	isDebuggerMessage,
} from "@fluid-tools/client-debugger";
import { DevToolsInitMessage } from "./Messages";
import { devtoolsMessageSource } from "./Constants";

/**
 * Context string for logging.
 */
 const loggingContext = "EXTENSION(DEVTOOLS)";

 /**
  * Formats the provided log message with the appropriate context information.
  */
 function formatForLogging(text: string): string {
	 return `${loggingContext}: ${text}`;
 }
 
 /**
  * Message relay for communicating with the Background Script.
  */
export class BackgroundConnection
	 extends TypedEventEmitter<IMessageReceiverEvents>
	 implements IMessageRelay
 {
	 /**
	  * Port connection to the Background Script
	  */
	 private readonly backgroundScriptConnection: TypedPortConnection;
	 
	 /**
	  * Handler for incoming messages from {@link backgroundScriptConnection}.
	  * Messages are forwarded on to subscribers for valid {@link IDebuggerMessage}s from the expected source.
	  */
	 private readonly messageRelayHandler = (message: Partial<IDebuggerMessage>): boolean => {
		 // Forward incoming message onto subscribers if it is one of ours.
		 // TODO: validate source
		 if (isDebuggerMessage(message)) {
			 console.log(formatForLogging(`Relaying message from Background to Devtools:`), message);
			 return this.emit("message", message);
		 }
		 return false;
	 }
 
	 public constructor() {
		 super();
 
		 // Create a connection to the background page
		 this.backgroundScriptConnection = chrome.runtime.connect({
			 name: "devtools-page",
		 });
 
		 // Relay the tab ID to the background service worker.
		 const initMessage: DevToolsInitMessage = {
			 source: devtoolsMessageSource,
			 type: "initializeDevtools",
			 data: {
				 tabId: chrome.devtools.inspectedWindow.tabId,
			 },
		 };
		 this.backgroundScriptConnection.postMessage(initMessage);
 
		 // Bind listeners
		 this.backgroundScriptConnection.onMessage.addListener(
			 this.messageRelayHandler,
		 );
		 this.backgroundScriptConnection.onDisconnect.addListener((port) => {
			 // TODO: anything we need to do here?
		 });
	 }
 }
 