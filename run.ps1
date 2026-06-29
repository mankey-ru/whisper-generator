# =============================================
# Whisper.cpp batch transcription (Russian)
# Обрабатывает все аудио в папке input и подпапках
# =============================================

# === ПАРАМЕТРЫ СКРИПТА ===
param(
    # run.ps1
    # run.ps1 -Recurse
    [switch]$Recurse = $false   # По умолчанию false — только файлы в input, без подпапок
)

# === НАСТРОЙКИ (измени под себя) ===
$WhisperExe = "C:\whisper.cpp\whisper-cli.exe"  # или путь к whisper.exe
$ModelPath  = "C:\whisper.cpp\models\ggml-large-v3.bin"           # или quantized версия
$InputDir   = ".\input"                                            # папка с аудио
$Language   = "ru"                                                 # русский
$Threads    = 12                                                   # под твои 32 ГБ RAM (можно 8-16)

# Поддерживаемые расширения
$AudioExtensions = @(".mp3", ".m4a", ".ogg", ".flac", ".aac")    # ".wav", 

# Создаём папку input, если нет
if (-not (Test-Path $InputDir)) {
    New-Item -ItemType Directory -Path $InputDir | Out-Null
    Write-Host "Создана папка $InputDir — положи туда аудиофайлы" -ForegroundColor Yellow
    exit
}

# Находим все аудиофайлы
$files = Get-ChildItem -Path $InputDir -File -Recurse:$Recurse | 
         Where-Object { $_.Extension.ToLower() -in $AudioExtensions }

if ($files.Count -eq 0) {
    Write-Host "В папке input и подпапках аудиофайлов не найдено." -ForegroundColor Red
    exit
}

Write-Host "Найдено $($files.Count) аудиофайлов. Начинаем транскрипцию..." -ForegroundColor Green

foreach ($file in $files) {
    $inputFile = $file.FullName
    $baseName  = [System.IO.Path]::GetFileNameWithoutExtension($inputFile)
    $dir       = $file.DirectoryName
    
    $txtFile = Join-Path $dir "$baseName.txt"
    # $srtFile = Join-Path $dir "$baseName.srt"
    # $jsonFile = Join-Path $dir "$baseName.json"

    # Пропускаем, если уже обработан (txt существует)
    if (Test-Path $txtFile) {
        Write-Host "Пропуск (уже есть): $($file.Name)" -ForegroundColor Gray
        continue
    }

    Write-Host "Обрабатываю: $($file.Name)" -ForegroundColor Cyan

    # === Конвертация в WAV (если нужно) ===
    $wavFile = Join-Path $dir "$baseName.wav"
    if (-not (Test-Path $wavFile)) {
        Write-Host "  Конвертирую в WAV..." -ForegroundColor Yellow
        & ffmpeg -i `"$inputFile`" -ar 16000 -ac 1 -c:a pcm_s16le `"$wavFile`" -y
        if (-not (Test-Path $wavFile)) {
            Write-Host "  Ошибка конвертации $($file.Name)" -ForegroundColor Red
            continue
        }
    }

    # Основная команда
    & $WhisperExe `
        -m $ModelPath `
        -f `"$wavFile`" `
        -l $Language `
        -t $Threads `
        --output-txt `
        --print-progress
        # --output-srt `
        # --output-json `

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Готово: $baseName" -ForegroundColor Green
    } else {
        Write-Host "Ошибка при обработке $($file.Name)" -ForegroundColor Red
    }
}

Write-Host "`nВсе файлы обработаны!" -ForegroundColor Green