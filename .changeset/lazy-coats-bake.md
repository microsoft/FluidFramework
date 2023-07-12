---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluid-experimental/tree": minor
"@fluid-experimental/tree2": minor
---

Move closeAndGetPendingLocalState to IContainerExperimental

This change deprecates the experimental method closeAndGetPendingLocalState on IContainer and moves it to IContainerExperimental.
IContainerExperimental is an interface that is easily casted to, which enables partners to access experimental features for testing and evaluation.
Moving the experimental method off IContainer will reduce exposure and churn on that production interface as we iterate on and finalize our experimental features.
Experimental features should not be used in production environments.
