import { NetworkError } from "@fluidframework/server-services-client";
import type {
	IFluidAccessTokenGenerator,
	IFluidAccessToken,
} from "@fluidframework/server-services-core";

export class FluidAccessTokenGenerator implements IFluidAccessTokenGenerator {
	public async generateFluidToken(
		tenantId: string,
		bearerAuthToken: string,
		requestBody?: Record<string, any>,
	): Promise<IFluidAccessToken> {
		throw new NetworkError(
			501,
			"Access token generation is not implemented.",
			false /* canRetry */,
		);
	}
}
