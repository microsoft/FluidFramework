import * as jwt from "jsonwebtoken";

// Responsible for creating, managing, and removing jw tokens.
// Uses a local map for faster response.
export class TokenManager {
    private tokenMap: {[email: string]: string};

    constructor(private tenantId: string, private secretKey: string, private symmetricKey: string) {
        this.tokenMap = {};
    }

    public getOrCreateToken(email: string, name: string): string {
        if (!(email in this.tokenMap)) {
            this.tokenMap[email] = this.craftToken(email, name);
        }
        return this.tokenMap[email];
    }

    public clearToken(email: string): void {
        delete this.tokenMap[email];
    }

    private craftToken(email: string, name: string): string {
        return jwt.sign(
            {
                 permission: "read:write",
                 secret: this.secretKey,
                 tenantid: this.tenantId,
                 user: {
                    data: null,
                    id: email,
                    name,
                },
            },
            this.symmetricKey,
        );
    }
}
