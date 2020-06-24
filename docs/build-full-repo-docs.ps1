# Build docs for the whole repo
# All generated files will be in _api-extractor-temp
Push-Location ../
Write-Output "===================================npm install"
npm install

Write-Output "===================================npm build:fast --install"
npm run build:fast -- --install

Write-Output "===================================npm build:fast --symlik"
npm run build:fast -- --symlink

Write-Output "===================================npm build:fast --all"
npm run build:fast -- --nolint --all

Write-Output "===================================npm build:fast --all -s build:docs"
npm run build:fast -- --nolint --all -s build:docs

Pop-Location
