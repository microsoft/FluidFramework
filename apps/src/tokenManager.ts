import * as jwt from "jsonwebtoken";
import { SECRET_KEY, SYMMETRIC_KEY, TENANT_ID } from "./keys";

// Responsible for creating, managing, and removing jw tokens.
// Uses a local map for faster response.
export class TokenManager {
    private tokenMap: {[email: string]: string};

    constructor() {
        this.tokenMap = {};
    }

    public getOrCreateToken(email: string): string {
        if (!(email in this.tokenMap)) {
            this.tokenMap[email] = this.craftToken(email);
        }
        return this.tokenMap[email];
    }

    public clearToken(email: string): void {
        delete this.tokenMap[email];
    }

    private craftToken(email: string): string {
        return jwt.sign(
            {
                 permission: "read:write",
                 secret: SECRET_KEY,
                 tenantid: TENANT_ID,
                 user: {
                    data: null,
                    id: email,
                },
            },
            SYMMETRIC_KEY);
    }

}
