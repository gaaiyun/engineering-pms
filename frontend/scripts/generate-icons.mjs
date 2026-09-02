/**
 * PWA图标生成脚本
 * 使用sharp库从SVG生成各种尺寸的PNG图标
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const ANDROID_RES_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// 需要生成的图标尺寸
const ICON_SIZES = [32, 72, 96, 128, 144, 152, 192, 384, 512];
const ANDROID_DENSITIES = [
  { dir: 'mipmap-mdpi', icon: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', icon: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', icon: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', icon: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', icon: 192, foreground: 432 },
];

// 启动画面尺寸 (宽x高) - 支持iPhone 12-17全系列
const SPLASH_SIZES = [
  // 旧机型兼容
  { width: 640, height: 1136, name: 'splash-640x1136' },    // iPhone 5/SE
  { width: 750, height: 1334, name: 'splash-750x1334' },    // iPhone 6/7/8
  { width: 1242, height: 2208, name: 'splash-1242x2208' },  // iPhone 6/7/8 Plus
  { width: 1125, height: 2436, name: 'splash-1125x2436' },  // iPhone X/XS/11 Pro
  
  // iPhone 12/13/14 系列
  { width: 1170, height: 2532, name: 'splash-1170x2532' },  // iPhone 12/13/14
  { width: 1284, height: 2778, name: 'splash-1284x2778' },  // iPhone 12/13/14 Pro Max, 14 Plus
  
  // iPhone 15/16/17 系列
  { width: 1179, height: 2556, name: 'splash-1179x2556' },  // iPhone 15/16
  { width: 1290, height: 2796, name: 'splash-1290x2796' },  // iPhone 15/16 Plus/Pro Max
  { width: 1320, height: 2868, name: 'splash-1320x2868' },  // iPhone 16/17 Pro Max (预估)
];

// 创建一个漂亮的图标 SVG
const createIconSVG = (_size, round = false) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512">
      <stop offset="0%" stop-color="#06152C"/>
      <stop offset="54%" stop-color="#102F63"/>
      <stop offset="100%" stop-color="#1F5EDB"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="12%" r="78%">
      <stop offset="0%" stop-color="#60A5FA" stop-opacity="0.42"/>
      <stop offset="58%" stop-color="#2563EB" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#2563EB" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="structure" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#DBEAFE"/>
    </linearGradient>
    <linearGradient id="accent" x1="112" y1="382" x2="392" y2="192" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#5EEAD4"/>
      <stop offset="100%" stop-color="#14B8A6"/>
    </linearGradient>
    <filter id="markShadow" x="-30%" y="-30%" width="170%" height="180%">
      <feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#020617" flood-opacity="0.36"/>
    </filter>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.10"/>
    </pattern>
    <clipPath id="clip">${round ? '<circle cx="256" cy="256" r="256"/>' : '<rect width="512" height="512" rx="112"/>'}</clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="512" height="512" fill="url(#bg)"/>
    <rect width="512" height="512" fill="url(#glow)"/>
    <path d="M512 72V512H68Z" fill="#2F6BFF" opacity="0.28"/>
    <rect width="512" height="512" fill="url(#grid)"/>
  </g>
  <g filter="url(#markShadow)">
    <rect x="128" y="214" width="82" height="166" rx="14" fill="url(#structure)"/>
    <rect x="230" y="150" width="86" height="230" rx="14" fill="url(#structure)"/>
    <rect x="336" y="96" width="66" height="284" rx="14" fill="url(#structure)"/>
    <path d="M112 392H418" fill="none" stroke="#EAF3FF" stroke-width="24" stroke-linecap="round"/>
    <path d="M112 314L204 382L392 192" fill="none" stroke="#0B1F3A" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M112 314L204 382L392 192" fill="none" stroke="url(#accent)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;

const createForegroundSVG = () => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <defs>
    <linearGradient id="structure" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#DBEAFE"/></linearGradient>
    <linearGradient id="accent" x1="25" y1="78" x2="80" y2="41" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#5EEAD4"/><stop offset="100%" stop-color="#14B8A6"/></linearGradient>
  </defs>
  <g opacity="0.28" transform="translate(0 2)">
    <rect x="29" y="45" width="17" height="33" rx="3" fill="#020617"/><rect x="49" y="32" width="18" height="46" rx="3" fill="#020617"/><rect x="70" y="22" width="13" height="56" rx="3" fill="#020617"/>
  </g>
  <rect x="29" y="45" width="17" height="33" rx="3" fill="url(#structure)"/>
  <rect x="49" y="32" width="18" height="46" rx="3" fill="url(#structure)"/>
  <rect x="70" y="22" width="13" height="56" rx="3" fill="url(#structure)"/>
  <path d="M26 81H86" fill="none" stroke="#EAF3FF" stroke-width="5" stroke-linecap="round"/>
  <path d="M25 65L43 78L80 41" fill="none" stroke="#0B1F3A" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M25 65L43 78L80 41" fill="none" stroke="url(#accent)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

// 创建启动画面 SVG
const createSplashSVG = (width, height) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="splashBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F8FAFC"/>
      <stop offset="100%" style="stop-color:#E2E8F0"/>
    </linearGradient>
    <linearGradient id="iconBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#081A35"/>
      <stop offset="100%" style="stop-color:#2563EB"/>
    </linearGradient>
  </defs>
  
  <!-- 背景 -->
  <rect width="${width}" height="${height}" fill="url(#splashBg)"/>
  
  <!-- 中央图标 -->
  <g transform="translate(${(width - 200) / 2}, ${(height - 280) / 2})">
    <rect width="200" height="200" rx="40" fill="url(#iconBg)"/>
    <g transform="scale(0.390625)">
      <rect x="128" y="214" width="82" height="166" rx="14" fill="#FFFFFF"/>
      <rect x="230" y="150" width="86" height="230" rx="14" fill="#FFFFFF"/>
      <rect x="336" y="96" width="66" height="284" rx="14" fill="#FFFFFF"/>
      <path d="M112 392H418" fill="none" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round"/>
      <path d="M112 314L204 382L392 192" fill="none" stroke="#0B1F3A" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M112 314L204 382L392 192" fill="none" stroke="#2DD4BF" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <text x="100" y="240" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#1E293B" text-anchor="middle">EngineeringPMS</text>
    <text x="100" y="268" font-family="Arial, sans-serif" font-size="14" fill="#64748B" text-anchor="middle">工程项目管理</text>
  </g>
</svg>
`;

async function generateIcons() {
  console.log('🎨 开始生成PWA图标...\n');

  // 确保目录存在
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  // 生成各尺寸图标
  for (const size of ICON_SIZES) {
    const svgBuffer = Buffer.from(createIconSVG(size));
    const outputPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`✅ 已生成: icon-${size}x${size}.png`);
  }

  fs.writeFileSync(path.join(ICONS_DIR, 'favicon.svg'), createIconSVG(512));
  console.log('✅ 已生成: favicon.svg');

  // 生成32x32 favicon
  const favicon32 = Buffer.from(createIconSVG(32));
  await sharp(favicon32)
    .resize(32, 32)
    .png()
    .toFile(path.join(ICONS_DIR, 'icon-32x32.png'));
  console.log('✅ 已生成: icon-32x32.png');

  console.log('\n🤖 生成 Android 自适应与旧版图标...\n');
  for (const density of ANDROID_DENSITIES) {
    const outputDir = path.join(ANDROID_RES_DIR, density.dir);
    fs.mkdirSync(outputDir, { recursive: true });
    await sharp(Buffer.from(createIconSVG(512)))
      .resize(density.icon, density.icon)
      .png()
      .toFile(path.join(outputDir, 'ic_launcher.png'));
    await sharp(Buffer.from(createIconSVG(512, true)))
      .resize(density.icon, density.icon)
      .png()
      .toFile(path.join(outputDir, 'ic_launcher_round.png'));
    await sharp(Buffer.from(createForegroundSVG()))
      .resize(density.foreground, density.foreground)
      .png()
      .toFile(path.join(outputDir, 'ic_launcher_foreground.png'));
  }

  // 生成启动画面
  console.log('\n📱 生成iOS启动画面...\n');
  
  for (const splash of SPLASH_SIZES) {
    const svgBuffer = Buffer.from(createSplashSVG(splash.width, splash.height));
    const outputPath = path.join(ICONS_DIR, `${splash.name}.png`);
    
    await sharp(svgBuffer)
      .resize(splash.width, splash.height)
      .png()
      .toFile(outputPath);
    
    console.log(`✅ 已生成: ${splash.name}.png`);
  }

  console.log('\n🎉 所有图标生成完成！');
  console.log(`📁 图标目录: ${ICONS_DIR}`);
}

generateIcons().catch(console.error);
