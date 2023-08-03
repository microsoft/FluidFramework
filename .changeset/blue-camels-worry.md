---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

Remove closeAndGetPendingLocalState from IContainer

This change removes the deprecated and experimental method closeAndGetPendingLocalState from IContainer. It continues to
exist on IContainerExperimental.

IContainerExperimental is an interface that is easily casted to, which enables partners to access experimental features for testing and evaluation.
Moving the experimental method off IContainer will reduce exposure and churn on that production interface as we iterate
on and finalize our experimental features.

Experimental features should not be used in production environments.
