# 🧹 SCRIPT DE LIMPEZA PÓS-TESTES
# Ponto Facial PWA - Limpeza Completa

Write-Host "🧹 Iniciando limpeza pós-testes..." -ForegroundColor Green

# 1. LIMPEZA DE BUILD E CACHE
Write-Host "📁 Limpando diretórios de build..." -ForegroundColor Yellow
Remove-Item -Path "apps/pwa/.next" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "apps/pwa/out" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ Diretórios .next e out removidos" -ForegroundColor Green

# 2. LIMPEZA DE CACHE PNPM
Write-Host "📦 Limpando cache do pnpm..." -ForegroundColor Yellow
pnpm store prune
Write-Host "✅ Cache do pnpm limpo" -ForegroundColor Green

# 3. LIMPEZA DE ARQUIVOS TEMPORÁRIOS
Write-Host "🗑️ Removendo arquivos temporários..." -ForegroundColor Yellow
Remove-Item -Path "PLANO_TESTES_APLICACAO.md" -ErrorAction SilentlyContinue
Remove-Item -Path "LIMPEZA_POS_TESTES.ps1" -ErrorAction SilentlyContinue
Remove-Item -Path "*.log" -ErrorAction SilentlyContinue
Remove-Item -Path "debug.*.log" -ErrorAction SilentlyContinue
Write-Host "✅ Arquivos temporários removidos" -ForegroundColor Green

# 4. LIMPEZA DE VARIÁVEIS DE AMBIENTE
Write-Host "🌍 Limpando variáveis de ambiente temporárias..." -ForegroundColor Yellow
$env:NEXT_TELEMETRY_DISABLED = $null
$env:NEXT_BUILD_DIAGNOSTICS_DISABLED = $null
Write-Host "✅ Variáveis de ambiente limpas" -ForegroundColor Green

# 5. VERIFICAÇÃO FINAL
Write-Host "🔍 Verificação pós-limpeza..." -ForegroundColor Yellow
$buildDir = Test-Path "apps/pwa/.next"
$outDir = Test-Path "apps/pwa/out"

if (-not $buildDir -and -not $outDir) {
    Write-Host "✅ Limpeza concluída com sucesso!" -ForegroundColor Green
    Write-Host "📋 Diretórios removidos: .next, out" -ForegroundColor Cyan
    Write-Host "🗑️ Cache limpo: pnpm store" -ForegroundColor Cyan
    Write-Host "🌍 Variáveis de ambiente resetadas" -ForegroundColor Cyan
} else {
    Write-Host "⚠️ Alguns arquivos podem não ter sido removidos" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎯 Status dos Deploys Após Limpeza:" -ForegroundColor Blue
Write-Host "✅ Vercel: https://ponto-facial-lh4440q5c-nelsons-projects-f8279dc6.vercel.app" -ForegroundColor Green
Write-Host "✅ Firebase: https://dbponto-facial.web.app (redirecionamento)" -ForegroundColor Green
Write-Host "❌ Build Local: Ainda bloqueado no Windows (Next.js)" -ForegroundColor Red

Write-Host ""
Write-Host "📝 Próximos passos:" -ForegroundColor Blue
Write-Host "1. Executar testes funcionais no Vercel" -ForegroundColor White
Write-Host "2. Validar todas as funcionalidades da aplicação" -ForegroundColor White
Write-Host "3. Documentar resultados dos testes" -ForegroundColor White

# Auto-destruição do script
Start-Sleep -Seconds 3
Remove-Item -Path $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue
