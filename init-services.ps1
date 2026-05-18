$ErrorActionPreference = "Stop"
Write-Host "Initializing Services..." -ForegroundColor Cyan

$services = @("booking-service", "user-service", "payment-service")

foreach ($service in $services) {
    $serviceDir = "services\$service"
    New-Item -ItemType Directory -Path $serviceDir -Force | Out-Null
    
    $pkgJson = @"
{
  "name": "$service",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts",
  "dependencies": {
    "express": "^4.18.2"
  }
}
"@
    Set-Content -Path "$serviceDir\package.json" -Value $pkgJson
    
    $indexTs = @"
import express from 'express';
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('$service is running!');
});

app.listen(port, () => {
  console.log(`$service listening on port `$port`);
});
"@
    Set-Content -Path "$serviceDir\index.ts" -Value $indexTs
    Write-Host "Created $service." -ForegroundColor Green
}

Write-Host "Services initialized successfully!" -ForegroundColor Cyan
