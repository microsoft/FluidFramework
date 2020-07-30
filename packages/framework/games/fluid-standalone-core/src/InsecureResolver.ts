import { IRequest } from '@fluidframework/component-core-interfaces';
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from '@fluidframework/driver-definitions';
import { ITokenClaims, IUser } from '@fluidframework/protocol-definitions';
import * as jwt from 'jsonwebtoken';

export class InsecureUrlResolver implements IUrlResolver {
  constructor(
    private readonly ordererUrl: string,
    private readonly storageUrl: string,
    private readonly tenantId: string,
    private readonly key: string,
    private readonly user: IUser,
  ) {}
  getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
    throw new Error('Method not implemented.');
  }

  public async resolve(request: IRequest): Promise<IResolvedUrl> {
    const parsedUrl = new URL(request.url);
    const documentId = parsedUrl.pathname.substr(1).split('/')[0];

    const documentUrl =
      `fluid://${new URL(this.ordererUrl).host}` + `/${encodeURIComponent(this.tenantId)}` + parsedUrl.pathname;

    const deltaStorageUrl = `${this.ordererUrl}/deltas/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(
      documentId,
    )}`;

    const storageUrl = `${this.storageUrl}/repos/${encodeURIComponent(this.tenantId)}`;

    const response: IFluidResolvedUrl = {
      endpoints: {
        deltaStorageUrl,
        ordererUrl: this.ordererUrl,
        storageUrl,
      },
      tokens: { jwt: this.auth(this.tenantId, documentId) },
      type: 'fluid',
      url: documentUrl,
    };

    return response;
  }

  private auth(tenantId: string, documentId: string) {
    const claims: ITokenClaims = {
      documentId,
      scopes: ['doc:read', 'doc:write', 'summary:write'],
      tenantId,
      user: this.user,
    };

    return jwt.sign(claims, this.key);
  }
}
