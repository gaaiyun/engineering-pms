$version = "0.22.21"
$os = "windows"
$arch = "amd64"
$zipName = "pocketbase_${version}_${os}_${arch}.zip"
$url = "https://github.com/pocketbase/pocketbase/releases/download/v${version}/${zipName}"

Write-Host "Downloading PocketBase v${version}..."
Invoke-WebRequest -Uri $url -OutFile $zipName

Write-Host "Extracting..."
Expand-Archive -Path $zipName -DestinationPath . -Force

Write-Host "Done! You can now run: ./pocketbase serve"
Remove-Item $zipName


