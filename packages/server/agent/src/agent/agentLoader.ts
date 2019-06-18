/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as request from "request";
import * as url from "url";

// Interface for a remote agent.
export interface IAgent {

    name: string;

    code: any;
}

// Interface for already uploaded agent names
interface IAgentNames {
    names: string[];
}

// Responsible for loading/applying runtime added agent.
export class AgentLoader {

    // List of loaded/added agent agents.
    private runtimeAgents: { [name: string]: IAgent } = {};

    // In case agent server is not available, try a few times.
    private loadTryCounter: number = 0;

    constructor(private agentModuleLoader: (id: string) => Promise<any>, private agentServer: string) {
    }

    public getAgents(): { [name: string]: IAgent } {
        return this.runtimeAgents;
    }

    public async loadUploadedAgents(): Promise<IAgent[]> {
        const agents = await this.loadUploadedAgentNames();
        const allAgentNames = (JSON.parse(agents) as IAgentNames).names;
        const agentNames = allAgentNames.filter((name) => (name.indexOf("/") === -1));
        const loadPromises = agentNames.map((agentName) => this.loadNewAgent(agentName));
        const loadedAgents = await Promise.all(loadPromises);
        return loadedAgents;
    }

    public async loadNewAgent(agentName: string): Promise<IAgent> {
        // Load the agent code
        const agentCode = await this.agentModuleLoader(agentName);

        // Update the loaded agent code and push in the list
        const newAgent: IAgent = {
            code: agentCode,
            name: agentName,
        };
        this.runtimeAgents[newAgent.name] = newAgent;

        return newAgent;
    }

    public unloadAgent(agentName: string) {
        if (agentName in this.runtimeAgents) {
            delete this.runtimeAgents[agentName];
        }
    }

    // Loads the uploaded agent names. In case agent server in not available, retries a few times.
    private async loadUploadedAgentNames(): Promise<any> {
        ++this.loadTryCounter;
        return new Promise<any>((resolve, reject) => {
            request.get(url.resolve(this.agentServer, `agent`), (error, response, body) => {
                if (error || response.statusCode !== 200) {
                    if (this.loadTryCounter <= 5) {
                        setTimeout(() => {
                            this.loadUploadedAgentNames();
                        }, 10000);
                    } else {
                        reject(error);
                    }
                } else {
                    this.loadTryCounter = 0;
                    resolve(body);
                }
            });
        });
    }
}
