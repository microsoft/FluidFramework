/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Promise } from "es6-promise";
import * as _ from "lodash";
import * as postMessageSockets from "../post-message-sockets/index";
import { IHost } from "./host";
import { IEchoService, ITable, ITableService } from "./interfaces";
import {
    IHostMessage,
    IHostMethodMessage,
    IHostMethodObjectResult,
    IHostMethodResult,
    IHostMethodValueResult,
    IInitResult,
    MessageType,
    MethodResultType,
} from "./messages";
import { RemoteObjectManager, RemoteService } from "./remote-object-manager";

/**
 * PostMessage implementation of the IHost interface. This hosts assumes it can connect to its
 * parent to receive messages.
 */
export class PostMessageHost implements IHost {
    private host: postMessageSockets.IPostMessageHost;
    private socketP: Promise<postMessageSockets.IPostMessageSocket>;
    private interfacesP: Promise<{ [name: string]: RemoteService }>;
    private manager = new RemoteObjectManager();

    constructor(private window: Window) {
    }

    public start() {
        this.host = postMessageSockets.getOrCreateHost(this.window);
        // TODO for security we may need to define a set of allowed hosts -
        // especially if the iframe conveys secret information to the host
        this.socketP = this.host.connect(window.parent, "*");

        // Listen to incoming connections and dispatch to the manager
        this.socketP.then((socket) => {
            // I should probably do this automatically
            socket.addEventListener((message) => {
                return this.manager.dispatch(message as IHostMethodMessage, socket);
            });
        });

        // Retrieve the available interfaces
        this.interfacesP = this.socketP.then((socket) => {
            let initMessage: IHostMessage = { type: MessageType.Init };
            return socket.send<IHostMessage, IInitResult>(initMessage).then((result) => {
                let services: { [name: string]: RemoteService } = {};
                // tslint:disable-next-line:forin:Want to iterate all fields
                for (let name in result.services) {
                    let serviceDefinition = result.services[name];
                    services[name] = new RemoteService(
                        this.manager,
                        socket,
                        serviceDefinition.objectId,
                        serviceDefinition.methods);
                }

                return services;
            });
        });
    }

    /**
     * Retrieves the list of interfaces supported by the host
     */
    public listServices(): Promise<string[]> {
        return this.interfacesP.then((interfaces) => {
            return _.keys(interfaces);
        });
    }

    /**
     * Detects if the given interface is supported - if so returns a reference to it
     */
    public getService<T>(name: string): Promise<T> {
        // does this call need to give me back something I can route from?
        return this.interfacesP.then((interfaces) => {
            if (!_.has(interfaces, name)) {
                throw { message: "Not supported" };
            }

            // Cast to any so we can cast our generated wrapper class to T
            let object = <T> (<any> interfaces[name]);

            return object;
        });
    }
}
