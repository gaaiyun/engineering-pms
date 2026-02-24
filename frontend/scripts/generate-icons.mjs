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

// 需要生成的图标尺寸
const ICON_SIZES = [32, 72, 96, 128, 144, 152, 192, 384, 512];

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
const createIconSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3B82F6"/>
      <stop offset="100%" style="stop-color:#1D4ED8"/>
    </linearGradient>
    <linearGradient id="progress" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#10B981"/>
      <stop offset="100%" style="stop-color:#059669"/>
    </linearGradient>
  </defs>
  <!-- 背景圆角矩形 -->
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="url(#bg)"/>
  
  <!-- 建筑主体 -->
  <g transform="translate(${size * 0.15}, ${size * 0.2}) scale(${size / 512 * 0.7})">
    <!-- 主楼 -->
    <rect x="80" y="120" width="240" height="280" rx="12" fill="white"/>
    
    <!-- 窗户 -->
    <rect x="110" y="150" width="40" height="40" rx="6" fill="#3B82F6"/>
    <rect x="180" y="150" width="40" height="40" rx="6" fill="#3B82F6"/>
    <rect x="250" y="150" width="40" height="40" rx="6" fill="#3B82F6"/>
    
    <rect x="110" y="210" width="40" height="40" rx="6" fill="#3B82F6"/>
    <rect x="180" y="210" width="40" height="40" rx="6" fill="#3B82F6"/>
    <rect x="250" y="210" width="40" height="40" rx="6" fill="#3B82F6"/>
    
    <rect x="110" y="270" width="40" height="40" rx="6" fill="#3B82F6"/>
    <rect x="180" y="270" width="40" height="40" rx="6" fill="#3B82F6"/>
    <rect x="250" y="270" width="40" height="40" rx="6" fill="#3B82F6"/>
    
    <!-- 门 -->
    <rect x="170" y="330" width="60" height="70" rx="6" fill="#3B82F6"/>
    
    <!-- 屋顶 -->
    <path d="M40 120 L200 20 L360 120 Z" fill="white"/>
    
    <!-- 进度条背景 -->
    <rect x="40" y="0" width="320" height="16" rx="8" fill="rgba(255,255,255,0.3)"/>
    <!-- 进度条 -->
    <rect x="40" y="0" width="224" height="16" rx="8" fill="url(#progress)"/>
  </g>
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
      <stop offset="0%" style="stop-color:#3B82F6"/>
      <stop offset="100%" style="stop-color:#1D4ED8"/>
    </linearGradient>
  </defs>
  
  <!-- 背景 -->
  <rect width="${width}" height="${height}" fill="url(#splashBg)"/>
  
  <!-- 中央图标 -->
  <g transform="translate(${(width - 200) / 2}, ${(height - 280) / 2})">
    <!-- 图标背景 -->
    <rect width="200" height="200" rx="40" fill="url(#iconBg)"/>
    
    <!-- 建筑图标 (简化版) -->
    <g transform="translate(30, 35) scale(0.28)">
      <rect x="80" y="120" width="240" height="280" rx="12" fill="white"/>
      <rect x="110" y="150" width="40" height="40" rx="6" fill="#3B82F6"/>
      <rect x="180" y="150" width="40" height="40" rx="6" fill="#3B82F6"/>
      <rect x="250" y="150" width="40" height="40" rx="6" fill="#3B82F6"/>
      <rect x="110" y="210" width="40" height="40" rx="6" fill="#3B82F6"/>
      <rect x="180" y="210" width="40" height="40" rx="6" fill="#3B82F6"/>
      <rect x="250" y="210" width="40" height="40" rx="6" fill="#3B82F6"/>
      <rect x="170" y="330" width="60" height="70" rx="6" fill="#3B82F6"/>
      <path d="M40 120 L200 20 L360 120 Z" fill="white"/>
    </g>
    
    <!-- 应用名称 -->
    <text x="100" y="240" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#1E293B" text-anchor="middle">工程结算</text>
    <text x="100" y="268" font-family="Arial, sans-serif" font-size="14" fill="#64748B" text-anchor="middle">管理系统</text>
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

  // 生成32x32 favicon
  const favicon32 = Buffer.from(createIconSVG(32));
  await sharp(favicon32)
    .resize(32, 32)
    .png()
    .toFile(path.join(ICONS_DIR, 'icon-32x32.png'));
  console.log('✅ 已生成: icon-32x32.png');

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
