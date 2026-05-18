$ErrorActionPreference = "Stop"
Write-Host "Initializing Apps..." -ForegroundColor Cyan

# 1. api-gateway (NestJS stub)
$gatewayDir = "apps\api-gateway"
New-Item -ItemType Directory -Path $gatewayDir -Force | Out-Null
$gatewayPkgJson = @"
{
  "name": "api-gateway",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts",
  "dependencies": {
    "express": "^4.18.2",
    "graphql": "^16.8.0",
    "@apollo/server": "^4.9.0"
  }
}
"@
Set-Content -Path "$gatewayDir\package.json" -Value $gatewayPkgJson
Set-Content -Path "$gatewayDir\index.ts" -Value "// Apollo GraphQL Federation Gateway stub"
Write-Host "Created api-gateway." -ForegroundColor Green

# 2. web-admin (Next.js stub)
$webAdminDir = "apps\web-admin"
New-Item -ItemType Directory -Path $webAdminDir -Force | Out-Null
$webAdminPkgJson = @"
{
  "name": "web-admin",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
"@
Set-Content -Path "$webAdminDir\package.json" -Value $webAdminPkgJson
Set-Content -Path "$webAdminDir\index.js" -Value "// Next.js Admin portal stub"
Write-Host "Created web-admin." -ForegroundColor Green

# 3. mobile-app (Expo stub)
$mobileAppDir = "apps\mobile-app"
New-Item -ItemType Directory -Path $mobileAppDir -Force | Out-Null
$mobileAppPkgJson = @"
{
  "name": "mobile-app",
  "version": "1.0.0",
  "private": true,
  "main": "App.js",
  "dependencies": {
    "expo": "^50.0.0",
    "react": "18.2.0",
    "react-native": "0.73.0"
  }
}
"@
Set-Content -Path "$mobileAppDir\package.json" -Value $mobileAppPkgJson
Set-Content -Path "$mobileAppDir\App.js" -Value "// Expo React Native app stub"
Write-Host "Created mobile-app." -ForegroundColor Green

Write-Host "Apps initialized successfully!" -ForegroundColor Cyan
