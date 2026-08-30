# Script para baixar modelos do Face API
Write-Host "Baixando modelos do Face API..."

$modelsDir = "public\models"
$baseUrl = "https://raw.githubusercontent.com/vladmandic/face-api/master/model"

# Lista de modelos para baixar
$models = @(
    @{ name = "face_landmark_68_model.bin"; url = "$baseUrl/face_landmark_68_model.bin" },
    @{ name = "face_landmark_68_tiny_model.bin"; url = "$baseUrl/face_landmark_68_tiny_model.bin" },
    @{ name = "face_landmark_68_tiny_model-weights_manifest.json"; url = "$baseUrl/face_landmark_68_tiny_model-weights_manifest.json" }
)

foreach ($model in $models) {
    $outputPath = Join-Path $modelsDir $model.name
    Write-Host "Baixando $($model.name)..."
    
    try {
        Invoke-WebRequest -Uri $model.url -OutFile $outputPath -UseBasicParsing
        $fileSize = (Get-Item $outputPath).Length
        Write-Host "✅ $($model.name) baixado com sucesso ($fileSize bytes)"
    }
    catch {
        Write-Host "❌ Falha ao baixar $($model.name): $($_.Exception.Message)"
        
        # Tentar URL alternativa
        $altUrl = $model.url -replace "vladmandic/face-api/master/model", "justadudewhohacks/face-api.js/master/weights"
        Write-Host "🔄 Tentando URL alternativa..."
        
        try {
            Invoke-WebRequest -Uri $altUrl -OutFile $outputPath -UseBasicParsing
            $fileSize = (Get-Item $outputPath).Length
            Write-Host "✅ $($model.name) baixado da URL alternativa ($fileSize bytes)"
        }
        catch {
            Write-Host "❌ Falha na URL alternativa também: $($_.Exception.Message)"
        }
    }
}

Write-Host "Download de modelos concluído!"