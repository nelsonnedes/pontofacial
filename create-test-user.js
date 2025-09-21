const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dbponto-facial'
});

async function createTestUser() {
  try {
    const userRecord = await admin.auth().createUser({
      email: 'teste@exemplo.com',
      password: '123456',
      displayName: 'Usuário Teste'
    });
    
    console.log('Usuário criado com sucesso:', userRecord.uid);
    console.log('Email: teste@exemplo.com');
    console.log('Senha: 123456');
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
  }
}

createTestUser();