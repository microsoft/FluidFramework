import * as jwt from "jsonwebtoken";

export class TokenGenerator {
    constructor(private tenantId: string, private secret: string) {
    }

    public generate(documentId: string) {
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write", // use "read:write" for now
                tenantId: this.tenantId,
                user: {
                    id: "test",
                },
            },
            this.secret);

        return token;
    }
}
