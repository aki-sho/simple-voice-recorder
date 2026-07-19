[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packagePath = Join-Path $root "package.json"
$packageLockPath = Join-Path $root "package-lock.json"
$tauriConfigPath = Join-Path $root "src-tauri\tauri.conf.json"
$cargoManifestPath = Join-Path $root "src-tauri\Cargo.toml"
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$tauriConfig = Get-Content -Raw -LiteralPath $tauriConfigPath | ConvertFrom-Json

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

function Remove-ProjectDirectory {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $rootPrefix = $root.TrimEnd("\") + "\"
    if (-not $resolvedPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a directory outside the project root: $resolvedPath"
    }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

$packageName = [string]$package.name
$displayName = [string]$package.displayName
$artifactName = [string]$package.artifactName
$version = [string]$package.version
$packageLockVersions = @(
    & node -e "const lock = require(process.argv[1]); console.log(lock.version); console.log(lock.packages[''].version);" $packageLockPath
)
if ($LASTEXITCODE -ne 0 -or $packageLockVersions.Count -ne 2) {
    throw "Could not read version values from package-lock.json."
}

if ([string]::IsNullOrWhiteSpace($packageName) -or
    [string]::IsNullOrWhiteSpace($displayName) -or
    [string]::IsNullOrWhiteSpace($artifactName) -or
    [string]::IsNullOrWhiteSpace($version)) {
    throw "package.json must define name, displayName, artifactName, and version."
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

$distPath = Join-Path $root "dist"
$stagePath = Join-Path $root ".release-stage"
Remove-ProjectDirectory -Path $distPath
Remove-ProjectDirectory -Path $stagePath
New-Item -ItemType Directory -Path $distPath | Out-Null

Push-Location $root
try {
    & npm.cmd run build -- --bundles nsis
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri NSIS build failed with exit code $LASTEXITCODE."
    }

    $nsisDirectory = Join-Path $root "src-tauri\target\release\bundle\nsis"
    $installerSource = Get-ChildItem -LiteralPath $nsisDirectory -File -Filter "*.exe" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $installerSource) {
        throw "The NSIS installer was not found in $nsisDirectory."
    }

    $setupName = "$artifactName-Setup-$version.exe"
    $portableName = "$artifactName-Portable-$version.exe"
    $zipName = "$artifactName-Portable-$version.zip"
    $setupPath = Join-Path $distPath $setupName
    $portablePath = Join-Path $distPath $portableName
    $zipPath = Join-Path $distPath $zipName

    Copy-Item -LiteralPath $installerSource.FullName -Destination $setupPath

    & cargo build --manifest-path $cargoManifestPath --release --features portable
    if ($LASTEXITCODE -ne 0) {
        throw "Portable Cargo build failed with exit code $LASTEXITCODE."
    }

    $portableSource = Join-Path $root "src-tauri\target\release\$packageName.exe"
    if (-not (Test-Path -LiteralPath $portableSource -PathType Leaf)) {
        throw "The portable executable was not found at $portableSource."
    }
    Copy-Item -LiteralPath $portableSource -Destination $portablePath

    $zipRootName = "$artifactName-Portable-$version"
    $zipRootPath = Join-Path $stagePath $zipRootName
    New-Item -ItemType Directory -Path $zipRootPath | Out-Null
    Copy-Item -LiteralPath $portablePath -Destination (Join-Path $zipRootPath $portableName)

    $readmeTemplatePath = Join-Path $root "packaging\README-Portable.txt"
    $portableReadme = ([IO.File]::ReadAllText($readmeTemplatePath, [Text.Encoding]::UTF8)).
        Replace("{{VERSION}}", $version).
        Replace("{{PORTABLE_EXE}}", $portableName).
        Replace("{{PORTABLE_DATA}}", "$artifactName-PortableData")
    [IO.File]::WriteAllText(
        (Join-Path $zipRootPath "README.txt"),
        $portableReadme,
        [Text.UTF8Encoding]::new($false)
    )

    Compress-Archive -LiteralPath $zipRootPath -DestinationPath $zipPath -CompressionLevel Optimal
    Remove-ProjectDirectory -Path $stagePath

    foreach ($artifactPath in @($setupPath, $portablePath, $zipPath)) {
        $artifact = Get-Item -LiteralPath $artifactPath
        $hash = Get-Sha256 -Path $artifact.FullName
        $checksumLine = "$hash  $($artifact.Name)`r`n"
        [IO.File]::WriteAllText(
            "$($artifact.FullName).sha256",
            $checksumLine,
            [Text.UTF8Encoding]::new($false)
        )
    }

    & (Join-Path $PSScriptRoot "verify-release.ps1")
}
finally {
    Remove-ProjectDirectory -Path $stagePath
    Pop-Location
}
