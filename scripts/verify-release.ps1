[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -Raw -LiteralPath (Join-Path $root "package.json") | ConvertFrom-Json
$packageLockPath = Join-Path $root "package-lock.json"
$tauriConfig = Get-Content -Raw -LiteralPath (Join-Path $root "src-tauri\tauri.conf.json") | ConvertFrom-Json
$cargoManifestPath = Join-Path $root "src-tauri\Cargo.toml"
$cargoLockPath = Join-Path $root "src-tauri\Cargo.lock"
$packageName = [string]$package.name
$displayName = [string]$package.displayName
$artifactName = [string]$package.artifactName
$version = [string]$package.version
$distPath = Join-Path $root "dist"
$packageLockVersions = @(
    & node -e "const lock = require(process.argv[1]); console.log(lock.version); console.log(lock.packages[''].version);" $packageLockPath
)
if ($LASTEXITCODE -ne 0 -or $packageLockVersions.Count -ne 2) {
    throw "Could not read version values from package-lock.json."
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $algorithm.ComputeHash($stream)
        return ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Get-StreamSha256 {
    param([Parameter(Mandatory)][IO.Stream]$Stream)

    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $algorithm.ComputeHash($Stream)
        return ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

if ($packageLockVersions[0] -ne $version -or $packageLockVersions[1] -ne $version) {
    throw "package.json and package-lock.json versions do not match."
}
if ($tauriConfig.productName -ne $displayName -or $tauriConfig.version -ne $version) {
    throw "package.json and tauri.conf.json name/version values do not match."
}

$cargoManifest = Get-Content -Raw -LiteralPath $cargoManifestPath
if ($cargoManifest -notmatch "(?m)^version\s*=\s*`"$([regex]::Escape($version))`"$") {
    throw "package.json and Cargo.toml versions do not match."
}
$cargoLock = Get-Content -Raw -LiteralPath $cargoLockPath
$cargoLockPattern = "(?ms)^\[\[package\]\]\r?\nname = `"$([regex]::Escape($packageName))`"\r?\nversion = `"$([regex]::Escape($version))`""
if ($cargoLock -notmatch $cargoLockPattern) {
    throw "Cargo.lock does not contain $packageName version $version."
}

$setupName = "$artifactName-Setup-$version.exe"
$portableName = "$artifactName-Portable-$version.exe"
$zipName = "$artifactName-Portable-$version.zip"
$artifactNames = @($setupName, $portableName, $zipName)
$expectedFiles = @(
    $setupName,
    "$setupName.sha256",
    $portableName,
    "$portableName.sha256",
    $zipName,
    "$zipName.sha256"
)

if (-not (Test-Path -LiteralPath $distPath -PathType Container)) {
    throw "Release directory not found: $distPath"
}

$actualFiles = @(
    Get-ChildItem -LiteralPath $distPath -File |
        Select-Object -ExpandProperty Name |
        Sort-Object
)
$missingFiles = @($expectedFiles | Where-Object { $_ -notin $actualFiles })
$unexpectedFiles = @($actualFiles | Where-Object { $_ -notin $expectedFiles })
if ($missingFiles.Count -gt 0 -or $unexpectedFiles.Count -gt 0) {
    throw "Release file set mismatch. Missing: $($missingFiles -join ', '); Unexpected: $($unexpectedFiles -join ', ')"
}

$results = foreach ($artifactNameEntry in $artifactNames) {
    $artifactPath = Join-Path $distPath $artifactNameEntry
    $checksumPath = "$artifactPath.sha256"
    $checksumText = (Get-Content -Raw -LiteralPath $checksumPath).Trim()
    if ($checksumText -notmatch "^([0-9a-fA-F]{64})\s{2}(.+)$") {
        throw "Invalid checksum file format: $checksumPath"
    }

    $expectedHash = $Matches[1].ToLowerInvariant()
    $checksumFileName = $Matches[2]
    if ($checksumFileName -ne $artifactNameEntry) {
        throw "Checksum filename mismatch in $checksumPath."
    }

    $actualHash = Get-Sha256 -Path $artifactPath
    if ($actualHash -ne $expectedHash) {
        throw "SHA-256 verification failed for $artifactNameEntry."
    }

    $item = Get-Item -LiteralPath $artifactPath
    if ($item.Length -le 0) {
        throw "Artifact is empty: $artifactPath"
    }

    if ($item.Extension -eq ".exe") {
        $productVersion = [string]$item.VersionInfo.ProductVersion
        if (-not [string]::IsNullOrWhiteSpace($productVersion) -and
            -not $productVersion.StartsWith($version, [StringComparison]::Ordinal)) {
            throw "Executable version mismatch for $artifactNameEntry`: $productVersion"
        }
    }

    [pscustomobject]@{
        File = $artifactNameEntry
        Bytes = $item.Length
        SHA256 = $actualHash
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $distPath $zipName
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $zipRootName = "$artifactName-Portable-$version"
    $expectedEntries = @(
        "$zipRootName/$portableName",
        "$zipRootName/README.txt"
    )
    $actualEntries = @(
        $archive.Entries |
            Where-Object { -not [string]::IsNullOrEmpty($_.Name) } |
            ForEach-Object { $_.FullName.Replace("\", "/") } |
            Sort-Object
    )

    $missingEntries = @($expectedEntries | Where-Object { $_ -notin $actualEntries })
    $unexpectedEntries = @($actualEntries | Where-Object { $_ -notin $expectedEntries })
    if ($missingEntries.Count -gt 0 -or $unexpectedEntries.Count -gt 0) {
        throw "Portable ZIP structure mismatch. Missing: $($missingEntries -join ', '); Unexpected: $($unexpectedEntries -join ', ')"
    }

    $portableEntry = $archive.Entries |
        Where-Object { $_.FullName.Replace("\", "/") -eq "$zipRootName/$portableName" } |
        Select-Object -First 1
    $portableEntryStream = $portableEntry.Open()
    try {
        $zipPortableHash = Get-StreamSha256 -Stream $portableEntryStream
    }
    finally {
        $portableEntryStream.Dispose()
    }
    if ($zipPortableHash -ne (Get-Sha256 -Path (Join-Path $distPath $portableName))) {
        throw "The portable EXE in the ZIP does not match the standalone portable EXE."
    }

    $readmeEntry = $archive.Entries |
        Where-Object { $_.FullName.Replace("\", "/") -eq "$zipRootName/README.txt" } |
        Select-Object -First 1
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    $reader = [IO.StreamReader]::new($readmeEntry.Open(), $utf8, $true)
    try {
        $readmeText = $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }

    $requiredJapaneseText = @(
        (-join @([char]0x8D77, [char]0x52D5, [char]0x65B9, [char]0x6CD5)),
        (-join @(
            [char]0x9332,
            [char]0x97F3,
            [char]0x30D5,
            [char]0x30A1,
            [char]0x30A4,
            [char]0x30EB
        )),
        (-join @([char]0x79FB, [char]0x52D5, [char]0x65B9, [char]0x6CD5)),
        (-join @([char]0x524A, [char]0x9664, [char]0x65B9, [char]0x6CD5))
    )
    foreach ($requiredText in @(
        $portableName,
        "$artifactName-PortableData",
        "WebView2 Runtime"
    ) + $requiredJapaneseText) {
        if (-not $readmeText.Contains($requiredText)) {
            throw "Portable README is missing required text: $requiredText"
        }
    }
    if ($readmeText.Contains("{{")) {
        throw "Portable README contains an unreplaced template token."
    }
}
finally {
    $archive.Dispose()
}

$results | Format-Table -AutoSize
Write-Output "Release verification passed for $displayName $version."
