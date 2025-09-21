# Script para baixar o modelo face_recognition_model.bin correto
# Este modelo e necessario para o funcionamento do Face API

Write-Host "Baixando face_recognition_model.bin..." -ForegroundColor Yellow

$modelUrl = "https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_recognition_model.bin"
$outputPath = "models/face_recognition_model.bin"
$fallbackUrl = "https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model.bin"

try {
    # Tentar baixar do repositorio principal
    Write-Host "Tentando baixar de: $modelUrl" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $modelUrl -OutFile $outputPath -UseBasicParsing
    
    # Verificar se o arquivo foi baixado corretamente
    if (Test-Path $outputPath) {
        $fileSize = (Get-Item $outputPath).Length
        if ($fileSize -gt 1000) {
            Write-Host "face_recognition_model.bin baixado com sucesso ($fileSize bytes)" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "Arquivo muito pequeno, tentando URL alternativa..." -ForegroundColor Yellow
            Remove-Item $outputPath -Force
        }
    }
} catch {
    Write-Host "Erro no download principal: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    # Tentar URL alternativa
    Write-Host "Tentando URL alternativa: $fallbackUrl" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $fallbackUrl -OutFile $outputPath -UseBasicParsing
    
    # Verificar se o arquivo foi baixado corretamente
    if (Test-Path $outputPath) {
        $fileSize = (Get-Item $outputPath).Length
        if ($fileSize -gt 1000) {
            Write-Host "face_recognition_model.bin baixado com sucesso da URL alternativa ($fileSize bytes)" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "Arquivo ainda muito pequeno" -ForegroundColor Red
            Remove-Item $outputPath -Force
        }
    }
} catch {
    Write-Host "Erro no download alternativo: $($_.Exception.Message)" -ForegroundColor Red
}

# Remover arquivo corrompido se existir
if (Test-Path "models/face_recognition_model-shard1") {
    Write-Host "Removendo arquivo corrompido face_recognition_model-shard1" -ForegroundColor Yellow
    Remove-Item "models/face_recognition_model-shard1" -Force
}

Write-Host "Falha ao baixar face_recognition_model.bin" -ForegroundColor Red
exit 1