$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$localJdk = Join-Path $root ".tools\android\jdk-21\jdk-21.0.11+10"
$localSdk = Join-Path $root ".tools\android\sdk"
$jdkHome = if (Test-Path (Join-Path $localJdk "bin\java.exe")) { $localJdk } else { $env:JAVA_HOME }
$androidSdk = if (Test-Path (Join-Path $localSdk "platforms\android-36\android.jar")) { $localSdk } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $env:ANDROID_HOME }

if (!$jdkHome -or !(Test-Path (Join-Path $jdkHome "bin\java.exe"))) {
  throw "JDK 21 was not found. Place it under .tools/android/jdk-21 or set JAVA_HOME."
}

if (!$androidSdk -or !(Test-Path (Join-Path $androidSdk "platforms\android-36\android.jar"))) {
  throw "Android SDK Platform 36 was not found. Place it under .tools/android/sdk or set ANDROID_SDK_ROOT."
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

Push-Location $root
try {
  $sdkPath = $androidSdk -replace "\\", "/"
  Set-Content -Encoding UTF8 -Path "android\local.properties" -Value "sdk.dir=$sdkPath"
  npm.cmd run android:sync
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & android\gradlew.bat -p android assembleDebug
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $artifactDir = Join-Path $root "artifacts\android"
  New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
  Copy-Item -Force "android\app\build\outputs\apk\debug\app-debug.apk" (Join-Path $artifactDir "LoveLog-debug.apk")
} finally {
  Pop-Location
}
