import * as moniker from "moniker";

export function generateClientId(): string {
    return moniker.choose();
}
