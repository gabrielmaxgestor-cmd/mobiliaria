#!/usr/bin/env node
/**
 * scripts/audit-rotas.mjs
 * 
 * Auditoria completa de rotas, links, âncoras e parâmetros em public/
 * Zero dependências externas (roda puramente com Node.js).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

// Listar todos os arquivos HTML em public/
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
const htmlFileSet = new Set(htmlFiles);

// Mapear IDs e views presentes em cada arquivo HTML para validação de âncoras (#id)
const htmlIdsMap = new Map();

for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(publicDir, file), 'utf8');
  
  const ids = new Set();
  
  // Tags id="..."
  const idMatches = content.matchAll(/\bid=["']([^"']+)["']/g);
  for (const m of idMatches) {
    ids.add(m[1]);
  }
  
  // Tags name="..."
  const nameMatches = content.matchAll(/\bname=["']([^"']+)["']/g);
  for (const m of nameMatches) {
    ids.add(m[1]);
  }

  // Atributos data-view-section="..."
  const viewMatches = content.matchAll(/data-view-section=["']([^"']+)["']/g);
  for (const m of viewMatches) {
    ids.add(m[1]);
  }
  
  // Views e apelidos registrados nos painéis
  if (file === 'dashboard.html') {
    [
      'visao-geral', 'favoritos', 'buscas', 'imovel-dos-sonhos', 'simulacoes',
      'venda', 'minha-venda', 'visitas', 'propostas', 'mensagens',
      'documentos', 'notificacoes', 'configuracoes', 'jornada', 'historico', 'perfil'
    ].forEach(v => ids.add(v));
  }
  if (file === 'painel-corretor.html') {
    [
      'visao-geral', 'leads', 'visitas', 'mensagens', 'propostas', 'imoveis',
      'meus-imoveis', 'comissoes', 'desempenho', 'agenda', 'configuracoes',
      'captacao', 'clientes', 'relatorios', 'documentos', 'perfil'
    ].forEach(v => ids.add(v));
  }
  
  htmlIdsMap.set(file, ids);
}

const errors = [];
const warnings = [];
let totalLinksScanned = 0;

function addError(file, line, message) {
  errors.push({ file, line, message });
}

function addWarning(file, line, message) {
  warnings.push({ file, line, message });
}

// Analisar um arquivo HTML
function auditHtmlFile(fileName) {
  const filePath = path.join(publicDir, fileName);
  const content = fs.readFileSync(filePath, 'utf8');

  // 1. Validar tags <a>
  const anchorRegex = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi;
  let match;

  while ((match = anchorRegex.exec(content)) !== null) {
    totalLinksScanned++;
    const rawAttrs = match[1] + ' ' + match[3];
    const href = match[2].trim();
    
    // Obter número da linha aproximado
    const lineNum = content.slice(0, match.index).split('\n').length;

    // Ignorar links especiais ou âncoras vazias
    if (!href || href === '#' || href === 'javascript:void(0);' || href.startsWith('javascript:')) {
      continue;
    }

    // Ignorar template literals embutidos em JS inline (ex: ${imovelLink})
    if (href.includes('${')) {
      continue;
    }

    // Checar links externos
    if (href.startsWith('http://') || href.startsWith('https://')) {
      if (href.startsWith('http://localhost') || href.startsWith('http://livingcanvas') || href.startsWith('http://faithful')) {
        addError(fileName, lineNum, `Link interno usando HTTP inseguro: ${href}`);
      }
      
      // Validação de target="_blank" e rel="noopener"
      if (/target=["']_blank["']/i.test(rawAttrs)) {
        if (!/rel=["'][^"']*noopener[^"']*["']/i.test(rawAttrs)) {
          addError(fileName, lineNum, `Link externo target="_blank" sem rel="noopener": ${href}`);
        }
      }
      continue;
    }

    // Ignorar tel:, mailto:, data:
    if (href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('data:')) {
      continue;
    }

    // Validar link local
    validateLocalLink(fileName, lineNum, href);
  }

  // 2. Validar scripts inline com location.href / window.open
  const scriptLocationRegex = /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/g;
  while ((match = scriptLocationRegex.exec(content)) !== null) {
    totalLinksScanned++;
    const targetUrl = match[1].trim();
    const lineNum = content.slice(0, match.index).split('\n').length;
    if (targetUrl && !targetUrl.startsWith('http') && !targetUrl.includes('${')) {
      validateLocalLink(fileName, lineNum, targetUrl);
    }
  }

  const windowOpenRegex = /window\.open\(["']([^"']+)["']/g;
  while ((match = windowOpenRegex.exec(content)) !== null) {
    totalLinksScanned++;
    const targetUrl = match[1].trim();
    const lineNum = content.slice(0, match.index).split('\n').length;
    if (targetUrl && !targetUrl.startsWith('http') && !targetUrl.includes('${')) {
      validateLocalLink(fileName, lineNum, targetUrl);
    }
  }
}

// Analisar arquivos JS em public/
function auditJsFiles() {
  const jsFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.js'));
  for (const jsFile of jsFiles) {
    const filePath = path.join(publicDir, jsFile);
    const content = fs.readFileSync(filePath, 'utf8');

    // Busca por location.href = '...'
    const locRegex = /(?:window\.)?location(?:\.href)?\s*=\s*[`"']([^`"'$]+)[`"']/g;
    let match;
    while ((match = locRegex.exec(content)) !== null) {
      totalLinksScanned++;
      const url = match[1].trim();
      const lineNum = content.slice(0, match.index).split('\n').length;
      if (url && !url.startsWith('http') && !url.startsWith('//') && !url.includes('${')) {
        validateLocalLink(jsFile, lineNum, url);
      }
    }

    // Busca por safeRedirect('...')
    const safeRegex = /safeRedirect\(["']([^"']+)["']/g;
    while ((match = safeRegex.exec(content)) !== null) {
      totalLinksScanned++;
      const url = match[1].trim();
      const lineNum = content.slice(0, match.index).split('\n').length;
      if (url && !url.startsWith('http') && !url.includes('${')) {
        validateLocalLink(jsFile, lineNum, url);
      }
    }
  }
}

function validateLocalLink(sourceFile, lineNum, href) {
  // Tratar barra inicial (ex: /home.html -> home.html)
  let cleanHref = href.startsWith('/') ? href.slice(1) : href;

  // Separar destino, query e hash
  let targetFile = sourceFile;
  let query = '';
  let hash = '';

  const hashIdx = cleanHref.indexOf('#');
  if (hashIdx !== -1) {
    hash = cleanHref.slice(hashIdx + 1);
    cleanHref = cleanHref.slice(0, hashIdx);
  }

  const queryIdx = cleanHref.indexOf('?');
  if (queryIdx !== -1) {
    query = cleanHref.slice(queryIdx + 1);
    cleanHref = cleanHref.slice(0, queryIdx);
  }

  if (cleanHref) {
    targetFile = cleanHref;
  }

  // 1. Validar se arquivo existe em public/
  if (!htmlFileSet.has(targetFile)) {
    // Pode ser um asset estático como imagem, pdf ou css
    const assetPath = path.join(publicDir, targetFile);
    if (!fs.existsSync(assetPath)) {
      addError(sourceFile, lineNum, `Destino não encontrado em public/: "${targetFile}" (link original: ${href})`);
      return;
    }
  }

  // 2. Se destino for imovel.html (e não o próprio arquivo referenciando âncoras locais), exige ?id=
  if (targetFile === 'imovel.html') {
    const params = new URLSearchParams(query);
    if (!params.has('id') && sourceFile !== 'imovel.html') {
      addError(sourceFile, lineNum, `Link para imovel.html sem parâmetro ?id= (link: "${href}")`);
    }
  }

  // 3. Se destino for bairro.html (e não o próprio arquivo), exige ?b=
  if (targetFile === 'bairro.html') {
    const params = new URLSearchParams(query);
    if (!params.has('b') && sourceFile !== 'bairro.html') {
      addError(sourceFile, lineNum, `Link para bairro.html sem parâmetro ?b= (link: "${href}")`);
    }
  }

  // 4. Validar âncora (#id)
  if (hash) {
    const ids = htmlIdsMap.get(targetFile);
    if (ids && !ids.has(hash)) {
      addError(sourceFile, lineNum, `Âncora #${hash} não encontrada no arquivo ${targetFile} (link: "${href}")`);
    }
  }
}

// Executar varredura
for (const file of htmlFiles) {
  auditHtmlFile(file);
}
auditJsFiles();

// Relatório
console.log('='.repeat(70));
console.log(' AUDITORIA COMPLETA DE ROTAS E LINKS (Living Canvas)');
console.log('='.repeat(70));
console.log(`Arquivos HTML auditados : ${htmlFiles.length}`);
console.log(`Total de links checados : ${totalLinksScanned}`);
console.log(`Avisos detectados       : ${warnings.length}`);
console.log(`Erros detectados        : ${errors.length}`);
console.log('-'.repeat(70));

if (warnings.length > 0) {
  console.log('\n[AVISOS]');
  for (const w of warnings) {
    console.log(`  ⚠ [${w.file}:${w.line}] ${w.message}`);
  }
}

if (errors.length > 0) {
  console.log('\n[ERROS DETECTADOS]');
  for (const e of errors) {
    console.log(`  ✖ [${e.file}:${e.line}] ${e.message}`);
  }
  console.log('\n' + '='.repeat(70));
  console.log('RESULTADO: FALHA NA AUDITORIA (corrija os erros acima).');
  console.log('='.repeat(70));
  process.exit(1);
} else {
  console.log('\n✓ PARABÉNS: Todos os links, âncoras e parâmetros estão válidos e íntegros!');
  console.log('='.repeat(70));
  process.exit(0);
}
