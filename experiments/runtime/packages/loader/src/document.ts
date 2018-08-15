import { ICommit } from "@prague/gitresources";
import { IDocumentService, ITokenService, IUser } from "@prague/runtime-definitions";

export class Document {
    // tslint:disable:variable-name
    private _id: string;
    private _tenantId: string;
    private _user: IUser;
    // tslint:enable:variable-name

    public get tenantId(): string {
        return this._tenantId;
    }

    public get id(): string {
        return this._id;
    }

    public get user(): IUser {
        return this._user;
    }

    constructor(
        token: string,
        documentService: IDocumentService,
        tokenService: ITokenService,
        options: any) {

        const claims = tokenService.extractClaims(token);
        this._id = claims.documentId;
        this._tenantId = claims.tenantId;
        this._user = claims.user;
    }

    public async load(version: ICommit, connect: boolean): Promise<void> {
        return;
    }
}
