import {
    Browser,
    ISequencedClient,
} from "@prague/container-definitions";

export const snapshotTask = "snapshot";
export const intelTask = "intel";
export const translationTask = "translation";
export const spellTask = "spell";

export function resolveTask(clients: Map<string, ISequencedClient>, clientId: string): string {
    const selfClient = [...clients].filter((client) => client[0] === clientId);
    // The length should always be 1.
    if (selfClient.length > 0) {
        const client: ISequencedClient = selfClient[0][1];
        return (client.client && client.client.type && client.client.type !== Browser) ?
            client.client.type : undefined;
    }
}
