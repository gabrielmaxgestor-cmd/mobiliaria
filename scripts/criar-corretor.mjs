#!/usr/bin/env node
/**
 * Living Canvas - Script Administrativo de Criação de Corretor
 * 
 * Uso:
 *   node scripts/criar-corretor.mjs --email corretor@exemplo.com --nome "Nome do Corretor" --creci "12345-F" --telefone "(11) 98765-4321"
 * 
 * Requisitos:
 *   - Variável de ambiente GOOGLE_APPLICATION_CREDENTIALS apontando para a chave JSON da Service Account
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx).toLowerCase();
        const val = arg.slice(eqIdx + 1);
        parsed[key] = val;
      } else {
        const key = arg.slice(2).toLowerCase();
        const nextVal = args[i + 1];
        if (nextVal && !nextVal.startsWith("--")) {
          parsed[key] = nextVal;
          i++;
        } else {
          parsed[key] = true;
        }
      }
    }
  }
  return parsed;
}

function printUsage() {
  console.log(`
Living Canvas - Criação e Configuração de Corretor (Firebase Admin)

Uso:
  node scripts/criar-corretor.mjs --email <email> --nome <nome> --creci <creci> [--telefone <telefone>]

Parâmetros:
  --email     E-mail do corretor (obrigatório)
  --nome      Nome completo do corretor (obrigatório)
  --creci     Número do CRECI (obrigatório)
  --telefone  Telefone para contato / WhatsApp (opcional)

Exemplo:
  export GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
  node scripts/criar-corretor.mjs --email "contato@imobiliaria.com" --nome "Carlos Silva" --creci "12345-F" --telefone "(11) 99999-8888"
`);
}

function generateSecurePassword(length = 16) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  let pwd = "";
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    pwd += chars[randomBytes[i] % chars.length];
  }
  return pwd;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h || (!args.email && !args.nome && !args.creci)) {
    printUsage();
    process.exit(0);
  }

  const email = (args.email || "").toString().trim().toLowerCase();
  const nome = (args.nome || "").toString().trim();
  const creci = (args.creci || "").toString().trim();
  const telefone = (args.telefone || "").toString().trim();

  if (!email || !email.includes("@")) {
    console.error("❌ Erro: O parâmetro --email é obrigatório e deve ser válido.");
    printUsage();
    process.exit(1);
  }

  if (!nome) {
    console.error("❌ Erro: O parâmetro --nome é obrigatório.");
    printUsage();
    process.exit(1);
  }

  if (!creci) {
    console.error("❌ Erro: O parâmetro --creci é obrigatório.");
    printUsage();
    process.exit(1);
  }

  // 1. Carrega configuração do Firebase do projeto
  const configPath = path.join(rootDir, "firebase-applet-config.json");
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Erro: Arquivo de configuração não encontrado em ${configPath}`);
    process.exit(1);
  }

  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const projectId = firebaseConfig.projectId;
  const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId;

  console.log("------------------------------------------------------------");
  console.log("🚀 Living Canvas - Provisionamento de Corretor");
  console.log(`📁 Projeto Firebase: ${projectId}`);
  console.log(`🗄️  Banco Firestore: ${firestoreDatabaseId || "(default)"}`);
  console.log("------------------------------------------------------------");

  // 2. Verifica credenciais de serviço
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("❌ Erro: A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS não está definida.");
    console.error("Defina a variável com o caminho para o arquivo JSON da conta de serviço:");
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/service-account.json"');
    console.error("\nVeja o guia passo a passo em: docs/CRIAR-CORRETOR.md");
    process.exit(1);
  }

  const credentialsPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!fs.existsSync(credentialsPath)) {
    console.error(`❌ Erro: Arquivo de credenciais não encontrado em: ${credentialsPath}`);
    process.exit(1);
  }

  // 3. Inicializa Firebase Admin
  let app;
  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: projectId || serviceAccount.project_id
      });
    } catch (err) {
      console.error("❌ Erro ao inicializar Firebase Admin:", err.message);
      process.exit(1);
    }
  }

  const auth = getAuth(app);
  const db = firestoreDatabaseId && firestoreDatabaseId !== "(default)"
    ? getFirestore(app, firestoreDatabaseId)
    : getFirestore(app);

  let userRecord;
  let isNewUser = false;
  let tempPassword = null;

  // 4. Cria ou recupera o usuário no Firebase Auth
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`ℹ️  Usuário já cadastrado no Auth com UID: ${userRecord.uid}`);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      isNewUser = true;
      tempPassword = generateSecurePassword(16);
      userRecord = await auth.createUser({
        email,
        password: tempPassword,
        displayName: nome,
        emailVerified: true
      });
      console.log(`✅ Novo usuário criado no Firebase Auth com UID: ${userRecord.uid}`);
    } else {
      console.error("❌ Erro ao consultar usuário no Auth:", err.message);
      process.exit(1);
    }
  }

  // 5. Define Custom Claim { role: "corretor" }
  await auth.setCustomUserClaims(userRecord.uid, { role: "corretor" });
  console.log(`✅ Custom User Claim { role: "corretor" } atribuído com sucesso.`);

  // 6. Gera Link de Redefinição de Senha
  let passwordResetLink = null;
  try {
    passwordResetLink = await auth.generatePasswordResetLink(email);
  } catch (linkErr) {
    console.warn("⚠️  Aviso ao gerar link de redefinição de senha:", linkErr.message);
  }

  // 7. Grava registro na coleção 'usuarios'
  const userDocRef = db.collection("usuarios").doc(userRecord.uid);
  const userData = {
    uid: userRecord.uid,
    nome,
    email,
    role: "corretor",
    creci,
    telefone,
    atualizadoEm: FieldValue.serverTimestamp()
  };
  if (isNewUser) {
    userData.criadoEm = FieldValue.serverTimestamp();
  }
  await userDocRef.set(userData, { merge: true });
  console.log(`✅ Registro gravado em 'usuarios/${userRecord.uid}' com papel 'corretor'.`);

  // 8. Grava registro básico na coleção 'corretoresPublicos'
  const publicDocRef = db.collection("corretoresPublicos").doc(userRecord.uid);
  await publicDocRef.set({
    uid: userRecord.uid,
    nome,
    creci,
    telefone,
    email,
    visivel: true,
    atualizadoEm: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log(`✅ Perfil público gravado em 'corretoresPublicos/${userRecord.uid}'.`);

  // 9. Resumo Final
  console.log("\n============================================================");
  console.log("🎉 CORRETOR CONFIGURADO COM SUCESSO!");
  console.log("============================================================");
  console.log(`• Nome:     ${nome}`);
  console.log(`• E-mail:   ${email}`);
  console.log(`• UID:      ${userRecord.uid}`);
  console.log(`• CRECI:    ${creci}`);
  console.log(`• Telefone: ${telefone || "(não informado)"}`);
  console.log(`• Papel:    corretor (custom claim { role: "corretor" })`);

  if (isNewUser && tempPassword) {
    console.log("\n🔑 SENHA TEMPORÁRIA GERADA (copie agora, exibida uma única vez):");
    console.log(`   ${tempPassword}`);
  }

  if (passwordResetLink) {
    console.log("\n🔗 LINK DE DEFINIÇÃO / REDEFINIÇÃO DE SENHA:");
    console.log(`   ${passwordResetLink}`);
  }

  console.log("\n⚠️  ATENÇÃO:");
  console.log("   Se o corretor já estiver com uma sessão aberta no navegador,");
  console.log("   ele deve FAZER LOGOUT e LOGIN NOVAMENTE para que o novo");
  console.log("   Custom Claim { role: 'corretor' } seja incorporado ao token JWT.");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("❌ Erro fatal durante a execução:", err);
  process.exit(1);
});
