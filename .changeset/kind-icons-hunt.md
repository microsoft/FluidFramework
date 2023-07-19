---
"@fluidframework/test-utils": major
---

TestFluidObject.load removed

TestFluidObject.load performed unsafe initialization, and has instead been replaced by direct usage of the constructor plus a call to testFluidObject.initialize(). This should have no impact to your scenario, as instantiation of TestFluidObjects should only be done through TestFluidObjectFactory.
