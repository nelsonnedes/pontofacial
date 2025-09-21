'use client';

import CameraPanel from '@/components/CameraPanel';

export default function TesteCameraPage() {
  const handlePhotoCapture = (blob: Blob, imageData: ImageData, faceEmbedding?: any) => {
    console.log(`✅ Foto capturada: ${blob.size} bytes`);
    console.log(`📐 Dimensões: ${imageData.width}x${imageData.height}`);
    
    if (faceEmbedding) {
      console.log(`🧠 Embedding facial extraído com sucesso`);
      console.log(`📊 Confiança: ${faceEmbedding.confidence}`);
    }
  };

  const handleError = (error: string) => {
    console.error(`❌ Erro: ${error}`);
  };

  const handleFaceDetected = (count: number) => {
    console.log(`👤 ${count} face(s) detectada(s)`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🧪 Teste da Câmera
          </h1>
          <p className="text-gray-600">
            Componente de teste para verificar o funcionamento da câmera e Face API
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <CameraPanel
            onPhotoCapture={handlePhotoCapture}
            onError={handleError}
            onFaceDetected={handleFaceDetected}
            showPreview={true}
            autoStart={false}
            enableFaceDetection={true}
            requireFace={false}
          />
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            📋 Instruções de Teste
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>Clique em "🎥 Ativar Câmera" para iniciar a câmera</li>
            <li>Aguarde a inicialização do Face API</li>
            <li>Posicione seu rosto no centro da tela</li>
            <li>Clique em "📸 Capturar Foto" para testar a captura</li>
            <li>Verifique os logs no console do navegador (F12)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
