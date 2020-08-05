# Build docs for the whole repo
# All generated files will be in _api-extractor-temp

Push-Location ../

Write-Output "===================================npm clean"
npm run clean

Write-Output "===================================npm install"
npm install

Write-Output "===================================npm clean all"
npm run build:fast -- --clean

Write-Output "===================================npm build:fast --install --symlink --all"
npm run build:fast -- --install --symlink --all

Write-Output "===================================npm run build:fast -- --nolint --all -s build -s build:docs"
npm run build:fast -- --nolint --all -s build -s build:docs

Pop-Location
