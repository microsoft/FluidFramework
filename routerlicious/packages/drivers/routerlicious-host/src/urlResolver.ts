import {
    IRequest,
    IResolvedUrl,
    IUrlResolver,
} from "@prague/container-definitions";
import Axios from "axios";

export class ContanierUrlResolver implements IUrlResolver {
    constructor(private baseUrl: string, private jwt: string) {
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const headers = {
            Authorization: `Bearer ${this.jwt}`,
        };
        const resolved = await Axios.post<IResolvedUrl>(
            `${this.baseUrl}/api/v1/load`,
            {
                url: request.url,
            },
            {
                headers,
            });

        return resolved.data;
    }
}
