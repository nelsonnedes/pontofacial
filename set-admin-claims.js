const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dbponto-facial'
});

async function setAdminClaims() {
  try {
    // Email do usuário que deve se tornar admin
    const email = 'teste@exemplo.com';
    
    // Buscar usuário pelo email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Definir claims de administrador
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      admin: true
    });
    
    console.log(`Claims de administrador definidos para o usuário: ${email}`);
    console.log(`UID: ${userRecord.uid}`);
    
    // Verificar se as claims foram definidas
    const updatedUser = await admin.auth().getUser(userRecord.uid);
    console.log('Claims atuais:', updatedUser.customClaims);
    
  } catch (error) {
    console.error('Erro ao definir claims de admin:', error);
  }
}

setAdminClaims();