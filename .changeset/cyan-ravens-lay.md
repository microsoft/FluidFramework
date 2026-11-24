---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alternative flow for loading and initializing tree views

`ViewableTreeAlpha.openView` offers an alternative flow for loading and initializing tree views, which makes schema upgrades automatic (when required).
The caller, therefore, no longer needs to be concerned about various tree view compatibility states - the result is either a usable tree view or an error explaining why the document cannot be loaded or initialized.
