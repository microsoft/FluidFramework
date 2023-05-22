Function Add-PathVariable {
    param (
        [string]$addPath
    )
    if (Test-Path $addPath) {
        $regexAddPath = [regex]::Escape($addPath)
        $arrPath = $env:Path -split ';' | Where-Object { $_ -notMatch 
            "^$regexAddPath\\?" }
        $env:Path = ($arrPath + $addPath) -join ';'
    }
    else {
        Throw "'$addPath' is not a valid path."
    }
}

Write-Host "This script will do all init work needed for the project including tooling and build.";
Write-Host "Run this script the first time you work in this part of the repo.";
Write-Host "**********************************************************\n";

Write-Host "Setting up Rust tooling...";
$exePath = "$env:TEMP\rustup-init.exe"

Write-Host "Downloading..."
(New-Object Net.WebClient).DownloadFile('https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe', $exePath)

Write-Host "Installing..."
cmd /c start /wait $exePath -y
Remove-Item $exePath

Add-PathVariable "$env:USERPROFILE\.cargo\bin"

cargo --version
rustup --version
rustc --version

Write-Host "Installing wasm-snip..."
cargo install wasm-snip --version 0.4.0

Read-Host -Prompt "Press Enter to exit"