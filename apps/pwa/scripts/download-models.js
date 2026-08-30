const fs = require('fs');
const path = require('path');
const https = require('https');

// URLs dos modelos do Face API Web (usando CDN oficial)
const MODELS = [
  {
    name: 'tiny_face_detector_model-weights_manifest.json',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/tiny_face_detector_model-weights_manifest.json'
  },
  {
    name: 'tiny_face_detector_model-shard1',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/tiny_face_detector_model-shard1'
  },
  {
    name: 'face_landmark_68_model-weights_manifest.json',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/face_landmark_68_model-weights_manifest.json'
  },
  {
    name: 'face_landmark_68_model-shard1',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/face_landmark_68_model-shard1'
  },
  {
    name: 'face_recognition_model-weights_manifest.json',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/face_recognition_model-weights_manifest.json'
  },
  {
    name: 'face_recognition_model-shard1',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/face_recognition_model-shard1'
  },
  {
    name: 'face_recognition_model-shard2',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/face_recognition_model-shard2'
  },
  {
    name: 'face_expression_model-weights_manifest.json',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/face_expression_model-weights_manifest.json'
  },
  {
    name: 'face_expression_model-shard1',
    url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/face_expression_model-shard1'
  }
];

const MODELS_DIR = path.join(__dirname, '..', 'public', 'models');

// Função para baixar um arquivo
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Baixando: ${path.basename(filepath)}`);
    
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Erro HTTP: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`✅ Concluído: ${path.basename(filepath)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {}); // Remove arquivo parcial
      reject(err);
    });
  });
}

// Função principal
async function downloadModels() {
  try {
    console.log('🤖 Iniciando download dos modelos do Face API Web...');
    console.log(`📁 Diretório de destino: ${MODELS_DIR}`);
    
    // Criar diretório se não existir
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
      console.log('📁 Diretório criado.');
    }
    
    // Verificar se os modelos já existem
    const existingFiles = fs.readdirSync(MODELS_DIR);
    const missingModels = MODELS.filter(model => !existingFiles.includes(model.name));
    
    if (missingModels.length === 0) {
      console.log('✅ Todos os modelos já estão presentes!');
      return;
    }
    
    console.log(`📦 Baixando ${missingModels.length} modelo(s) faltante(s)...`);
    
    // Baixar modelos em paralelo (máximo 3 simultâneos)
    const downloadPromises = [];
    for (let i = 0; i < missingModels.length; i += 3) {
      const batch = missingModels.slice(i, i + 3);
      const batchPromises = batch.map(model => {
        const filepath = path.join(MODELS_DIR, model.name);
        return downloadFile(model.url, filepath);
      });
      
      await Promise.all(batchPromises);
    }
    
    console.log('🎉 Todos os modelos foram baixados com sucesso!');
    
    // Verificar integridade
    const finalFiles = fs.readdirSync(MODELS_DIR);
    console.log(`📊 Total de arquivos: ${finalFiles.length}`);
    
    // Calcular tamanho total
    let totalSize = 0;
    finalFiles.forEach(file => {
      const filepath = path.join(MODELS_DIR, file);
      const stats = fs.statSync(filepath);
      totalSize += stats.size;
    });
    
    console.log(`💾 Tamanho total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('❌ Erro ao baixar modelos:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  downloadModels();
}

module.exports = { downloadModels };