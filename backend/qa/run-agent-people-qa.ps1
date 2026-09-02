param(
  [string]$PocketBaseExe = 'G:\项目管理软件_v2\backend\pocketbase.exe',
  [int]$Port = 18091
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$qaParent = 'G:\dev-cache\engineering-pms-qa'
$qaRoot = Join-Path $qaParent ("qa{0}-{1}" -f $Port, (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$statusBefore = (git -C $repoRoot status --porcelain=v1) -join "`n"
$process = $null
$adminEmail = 'qa-admin@example.invalid'
$adminPassword = 'QA-only-Admin-2026'
$peopleMigration = Join-Path $repoRoot 'backend\pb_migrations\1788336000_enable_people_management.js'

if (-not (Test-Path -LiteralPath $PocketBaseExe)) { throw "PocketBase 0.22.21 not found: $PocketBaseExe" }
if (& $PocketBaseExe --version 2>&1 | Select-String -SimpleMatch '0.22.21' -Quiet) { } else { throw 'QA requires PocketBase 0.22.21' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use" }
if ((Get-Content -LiteralPath $peopleMigration -Raw) -match "findRecordsByFilter\('service_accounts'") {
  throw 'people_manage migration must not grant scopes to existing service accounts'
}

try {
  New-Item -ItemType Directory -Force -Path $qaRoot | Out-Null
  Copy-Item -LiteralPath $PocketBaseExe -Destination $qaRoot
  Copy-Item -LiteralPath (Join-Path $repoRoot 'backend\pb_hooks') -Destination $qaRoot -Recurse
  Copy-Item -LiteralPath (Join-Path $repoRoot 'backend\pb_migrations') -Destination $qaRoot -Recurse

  $pb = Join-Path $qaRoot 'pocketbase.exe'
  $data = Join-Path $qaRoot 'pb_data'
  $hooks = Join-Path $qaRoot 'pb_hooks'
  $migrations = Join-Path $qaRoot 'pb_migrations'
  & $pb migrate up --dir $data --hooksDir $hooks --migrationsDir $migrations | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'PocketBase migrations failed' }
  & $pb admin create $adminEmail $adminPassword --dir $data --hooksDir $hooks --migrationsDir $migrations | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'PocketBase QA admin creation failed' }

  $stdout = Join-Path $qaRoot 'stdout.log'
  $stderr = Join-Path $qaRoot 'stderr.log'
  $process = Start-Process -FilePath $pb -ArgumentList @(
    'serve',
    "--http=127.0.0.1:$Port",
    "--dir=$data",
    "--hooksDir=$hooks",
    "--migrationsDir=$migrations",
    '--hooksWatch=false'
  ) -WorkingDirectory $qaRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru

  $healthy = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($health.code -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  if (-not $healthy) { throw 'QA PocketBase did not become healthy' }

  $env:EPMS_QA_BASE_URL = "http://127.0.0.1:$Port"
  $env:EPMS_QA_ADMIN_EMAIL = $adminEmail
  $env:EPMS_QA_ADMIN_PASSWORD = $adminPassword
  node (Join-Path $PSScriptRoot 'agent-people.integration.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Agent people integration QA failed' }
} finally {
  Remove-Item Env:EPMS_QA_BASE_URL,Env:EPMS_QA_ADMIN_EMAIL,Env:EPMS_QA_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit(5000)
  }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 200
  }
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "QA cleanup failed: port $Port is still listening" }

  if (Test-Path -LiteralPath $qaRoot) {
    $resolvedParent = (Resolve-Path -LiteralPath $qaParent).Path.TrimEnd('\')
    $resolvedRoot = (Resolve-Path -LiteralPath $qaRoot).Path
    if (-not $resolvedRoot.StartsWith($resolvedParent + '\', [StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path -Leaf $resolvedRoot).StartsWith("qa$Port-")) {
      throw "Refusing to remove unexpected QA path: $resolvedRoot"
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}

if ((git -C $repoRoot status --porcelain=v1) -join "`n" -ne $statusBefore) { throw 'QA changed the worktree' }
Write-Output 'QA_CLEANUP_OK: no temporary database, service, log or test account remains'
