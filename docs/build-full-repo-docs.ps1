# Build docs for the whole repo
# All generated files will be in _api-extractor-temp
Push-Location ../server/routerlicious
npm run build:docs
Pop-Location

Push-Location ../common/lib/common-definitions
npm run build:docs
Pop-Location

Push-Location ../common/lib/common-utils
npm run build:docs
Pop-Location

Push-Location ../
npm run build:docs
Pop-Location
