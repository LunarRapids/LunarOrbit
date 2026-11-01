$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

python -m PyInstaller --noconfirm --clean `
  --name "LunarOrbitSim" `
  --windowed `
  --icon "assets\icon.ico" `
  --version-file "version_info.txt" `
  --add-data "web;web" `
  --add-data "assets\icon.ico;assets" `
  --collect-submodules "webview" `
  app.py

Write-Host "`nBuild complete: dist\LunarOrbitSim\LunarOrbitSim.exe" -ForegroundColor Green
