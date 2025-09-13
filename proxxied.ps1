param(
  [Parameter(Position=0, Mandatory=$True)]
  [ValidateSet("install", "dev")]
  [string]$Command
)

$ErrorActionPreference = "Stop"

function Invoke-Install {
    Push-Location $PSScriptRoot
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Pop-Location

    Push-Location "$PSScriptRoot\client"
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Pop-Location

    Push-Location "$PSScriptRoot\server"
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Pop-Location
}

function Invoke-Dev {
    Set-Location $PSScriptRoot
    npm run dev
    if ($LASTEXITCODE -ne 0) { throw "npm run dev failed" }
}

switch ($Command) {
    "install" { Invoke-Install }
    "dev"     { Invoke-Dev }
}