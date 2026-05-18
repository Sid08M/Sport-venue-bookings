$ErrorActionPreference = "Stop"

Write-Host "Initializing Next-Gen Sports Ecosystem Monorepo..." -ForegroundColor Cyan

# 1. Create root package.json with workspace definitions
$packageJson = @"
{
  "name": "sports-os-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*",
    "services/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "prettier": "^3.0.0",
    "turbo": "^2.0.0"
  }
}
"@
Set-Content -Path "package.json" -Value $packageJson
Write-Host "Created package.json with workspaces definition." -ForegroundColor Green

# 2. Create turbo.json
$turboJson = @"
{
  "`$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", "build/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
"@
Set-Content -Path "turbo.json" -Value $turboJson
Write-Host "Created turbo.json." -ForegroundColor Green

# 3. Create folder structure
$folders = @("apps", "packages", "services")
foreach ($folder in $folders) {
    if (!(Test-Path -Path $folder)) {
        New-Item -ItemType Directory -Path $folder | Out-Null
        Write-Host "Created directory: $folder/" -ForegroundColor Green
    }
}

# 4. Install dependencies
Write-Host "Running npm install to setup workspaces..." -ForegroundColor Cyan
npm install

Write-Host "Initialization complete!" -ForegroundColor Cyan
