import admin from 'firebase-admin';

// use Application Default Credentials (ADC)
// defina a variável GOOGLE_APPLICATION_CREDENTIALS para um .json de service account
if (!admin.apps.length) admin.initializeApp();

const email = process.argv[2];
const claims = JSON.parse(process.argv[3] || '{"admin":true}');

if (!email) {
  console.error('Uso: node scripts/set-claims.mjs <email> <jsonClaimsOpcional>');
  process.exit(1);
}

const run = async () => {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, claims);
  console.log(`OK: claims de ${email} =>`, claims);
};

run().catch((e) => { console.error(e); process.exit(1); });