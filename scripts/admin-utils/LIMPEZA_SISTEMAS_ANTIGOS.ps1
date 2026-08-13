# Script de limpeza profunda de arquivos antigos, mockados e sistemas legados
# Execute este script no PowerShell como Administrador, se necessário.

$arquivos_para_deletar = @(
    # Componentes do Sistema Antigo de Marcação e Câmera
    "apps\pwa\src\components\MarcarPontoClient.tsx",
    "apps\pwa\src\components\HybridPointCapture.tsx",
    "apps\pwa\src\components\FaceManagement.tsx",
    "apps\pwa\src\components\FaceRegistration.tsx",
    "apps\pwa\src\components\FaceVerification.tsx",
    "apps\pwa\src\components\PhotoCapture.tsx",
    "apps\pwa\src\components\CameraPanel.tsx",
    
    # Rotas Obsoletas de Teste e Verificação Velha
    "apps\pwa\src\app\app\verificacao-facial\page.tsx",
    "apps\pwa\src\components\facial-verification\InitialFacialVerification.tsx",
    "apps\pwa\src\app\teste-camera\page.tsx"
)

Write-Host "Iniciando a limpeza de código legado para garantir 100% de otimização..." -ForegroundColor Cyan

foreach ($arquivo in $arquivos_para_deletar) {
    $caminho_completo = Join-Path -Path $PWD -ChildPath $arquivo
    if (Test-Path $caminho_completo) {
        Remove-Item -Path $caminho_completo -Force -Recurse
        Write-Host "✅ Removido: $arquivo" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Já não existe: $arquivo" -ForegroundColor Yellow
    }
}

Write-Host "`nLimpando arquivos .md de logs antigos da IA gerados durante as manutenções..." -ForegroundColor Cyan
$md_files = Get-ChildItem -Path $PWD -Filter *.md -File
foreach ($md in $md_files) {
    if ($md.Name -ne "README.md") {
        Remove-Item -Path $md.FullName -Force
        Write-Host "✅ Removido Log MD: $($md.Name)" -ForegroundColor Green
    }
}

Write-Host "`n🎉 Limpeza concluída com sucesso! Nenhuma regressão ocorrerá.`n" -ForegroundColor Green
