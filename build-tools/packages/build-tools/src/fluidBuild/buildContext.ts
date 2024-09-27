import type { GitRepo } from "../common/gitRepo";
import type { IFluidBuildConfig } from "./fluidBuildConfig";

export interface BuildContext {
	fluidBuildConfig: IFluidBuildConfig | undefined;
	repoRoot: string;
	gitRepo: GitRepo;
}
