#!/usr/bin/env node
/**
 * scripts/aplicar-site-url.mjs
 * 
 * Atualiza automaticamente as meta tags (canonical, og:url, twitter:url),
 * o sitemap.xml e o robots.txt com base na URL definida em window.SITE_CONFIG.siteUrl
 * dentro de public/config.js.
 * 
 * Uso:
 *   node scripts/aplicar-site-url.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

// 1. Ler siteUrl de public/config.js
let siteUrl = 'https://livingcanvas.com.br';
const configPath = path.join(publicDir, 'config.js');

if (fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, 'utf8');
  const match = configContent.match(/siteUrl\s*:\s*["']([^"']+)["']/);
  if (match && match[1]) {
    siteUrl = match[1].trim().replace(/\/+$/, '');
  }
}

console.log('='.repeat(70));
console.log(' APLICADOR DE SITE_URL (Living Canvas)');
console.log('='.repeat(70));
console.log(`URL canônica configurada: ${siteUrl}\n`);

let updatedHtmlFiles = 0;
let updatedTagsCount = 0;

// 2. Atualizar todos os arquivos HTML em public/
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

for (const fileName of htmlFiles) {
  const filePath = path.join(publicDir, fileName);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  let fileChanges = 0;

  const pageCanonicalUrl = `${siteUrl}/${fileName}`;

  // a) Atualizar <link rel="canonical" href="...">
  if (/<link\s+[^>]*?rel=["']canonical["'][^>]*?>/i.test(content)) {
    content = content.replace(/(<link\s+[^>]*?rel=["']canonical["'][^>]*?href=["'])([^"']*)(["'][^>]*?>)/gi, (m, p1, oldHref, p3) => {
      if (oldHref !== pageCanonicalUrl) {
        fileChanges++;
        return `${p1}${pageCanonicalUrl}${p3}`;
      }
      return m;
    });
  } else if (/<head[^>]*>/i.test(content)) {
    // Inserir tag canonical se inexistente
    content = content.replace(/(<head[^>]*>)/i, `$1\n  <link rel="canonical" href="${pageCanonicalUrl}">`);
    fileChanges++;
  }

  // b) Atualizar <meta property="og:url" content="...">
  if (/<meta\s+[^>]*?property=["']og:url["'][^>]*?>/i.test(content)) {
    content = content.replace(/(<meta\s+[^>]*?property=["']og:url["'][^>]*?content=["'])([^"']*)(["'][^>]*?>)/gi, (m, p1, oldHref, p3) => {
      if (oldHref !== pageCanonicalUrl) {
        fileChanges++;
        return `${p1}${pageCanonicalUrl}${p3}`;
      }
      return m;
    });
  }

  // c) Atualizar <meta name="twitter:url" content="...">
  if (/<meta\s+[^>]*?(?:name|property)=["']twitter:url["'][^>]*?>/i.test(content)) {
    content = content.replace(/(<meta\s+[^>]*?(?:name|property)=["']twitter:url["'][^>]*?content=["'])([^"']*)(["'][^>]*?>)/gi, (m, p1, oldHref, p3) => {
      if (oldHref !== pageCanonicalUrl) {
        fileChanges++;
        return `${p1}${pageCanonicalUrl}${p3}`;
      }
      return m;
    });
  }

  // d) Substituir eventuais menções legadas da URL antiga de staging no cabeçalho
  if (content.includes('faithful-property-showcase.lovable.app')) {
    content = content.replace(/https:\/\/faithful-property-showcase\.lovable\.app/g, siteUrl);
    fileChanges++;
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    updatedHtmlFiles++;
    updatedTagsCount += fileChanges;
    console.log(`  ✓ ${fileName} atualizado (${fileChanges} tags modificadas)`);
  }
}

// 3. Atualizar public/sitemap.xml
let sitemapUpdated = false;
const sitemapPath = path.join(publicDir, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  const updatedSitemap = sitemapContent.replace(/<loc>https?:\/\/[^/<]+(\/[^<]*)?<\/loc>/g, (m, pagePath) => {
    return `<loc>${siteUrl}${pagePath || ''}</loc>`;
  });
  if (updatedSitemap !== sitemapContent) {
    fs.writeFileSync(sitemapPath, updatedSitemap, 'utf8');
    sitemapUpdated = true;
    console.log(`  ✓ sitemap.xml atualizado com o domínio ${siteUrl}`);
  }
}

// 4. Atualizar public/robots.txt
let robotsUpdated = false;
const robotsPath = path.join(publicDir, 'robots.txt');
if (fs.existsSync(robotsPath)) {
  const robotsContent = fs.readFileSync(robotsPath, 'utf8');
  const updatedRobots = robotsContent.replace(/^Sitemap:\s*https?:\/\/[^\s]+/m, `Sitemap: ${siteUrl}/sitemap.xml`);
  if (updatedRobots !== robotsContent) {
    fs.writeFileSync(robotsPath, updatedRobots, 'utf8');
    robotsUpdated = true;
    console.log(`  ✓ robots.txt atualizado com a diretiva Sitemap: ${siteUrl}/sitemap.xml`);
  }
}

console.log('-'.repeat(70));
console.log(`Arquivos HTML atualizados : ${updatedHtmlFiles}`);
console.log(`Tags meta modificadas     : ${updatedTagsCount}`);
console.log(`sitemap.xml modificado    : ${sitemapUpdated ? 'Sim' : 'Já atualizado'}`);
console.log(`robots.txt modificado     : ${robotsUpdated ? 'Sim' : 'Já atualizado'}`);
console.log('='.repeat(70));
console.log('✓ Aplicação de siteUrl concluída com sucesso!\n');
