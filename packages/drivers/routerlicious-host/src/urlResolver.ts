import {
    IRequest,
    IResolvedUrl,
    IUrlResolver,
} from "@prague/container-definitions";
import Axios from "axios";

export class ContainerUrlResolver implements IUrlResolver {
    private readonly cache = new Map<string, Promise<IResolvedUrl>>();

    constructor(
        private readonly baseUrl: string,
        private readonly jwt: string,
        cache?: Map<string, IResolvedUrl>,
    ) {
        if (cache) {
            for (const [key, value] of cache) {
                this.cache.set(key, Promise.resolve(value));
            }
        }
    }

    public resolve(request: IRequest): Promise<IResolvedUrl> {
        if (!this.cache.has(request.url)) {
            const headers = {
                Authorization: `Bearer ${this.jwt}`,
            };
            const resolvedP = Axios.post<IResolvedUrl>(
                `${this.baseUrl}/api/v1/load`,
                {
                    url: request.url,
                },
                {
                    headers,
                });

            this.cache.set(request.url, resolvedP.then((resolved) => resolved.data));
        }

        return this.cache.get(request.url)!;
    }
}
