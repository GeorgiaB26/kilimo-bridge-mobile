/**
 * Generate Kilimo Bridge app icons from SVG sources.
 * Run: node scripts/generate-app-icons.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const iconDir = path.join(assets, 'app-icon');

const BRAND_GREEN = '#1A4D3E';

async function renderSvg(svgPath, size) {
  const svg = fs.readFileSync(svgPath);
  return sharp(svg, { density: 300 }).resize(size, size).png().toBuffer();
}

async function writePng(buffer, outPath) {
  await sharp(buffer).png().toFile(outPath);
  console.log(`  wrote ${path.relative(root, outPath)}`);
}

async function solidBackground(size, color) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

async function main() {
  const fullIconSvg = path.join(iconDir, 'kilimo-app-icon.svg');
  const foregroundSvg = path.join(iconDir, 'kilimo-app-icon-foreground.svg');
  const monochromeSvg = path.join(iconDir, 'kilimo-app-icon-monochrome.svg');

  console.log('Generating Expo app icons…');

  const icon1024 = await renderSvg(fullIconSvg, 1024);
  await writePng(icon1024, path.join(assets, 'icon.png'));
  await writePng(icon1024, path.join(assets, 'splash-icon.png'));
  await writePng(await renderSvg(fullIconSvg, 512), path.join(iconDir, 'play-store-512.png'));
  await writePng(await renderSvg(fullIconSvg, 256), path.join(iconDir, 'web-favicon-256.png'));
  await writePng(await renderSvg(fullIconSvg, 180), path.join(iconDir, 'apple-touch-180.png'));
  await writePng(await renderSvg(fullIconSvg, 128), path.join(iconDir, 'launcher-128.png'));
  await writePng(await renderSvg(fullIconSvg, 48), path.join(assets, 'favicon.png'));

  const fg1024 = await renderSvg(foregroundSvg, 1024);
  await writePng(fg1024, path.join(assets, 'android-icon-foreground.png'));

  const mono1024 = await renderSvg(monochromeSvg, 1024);
  await writePng(mono1024, path.join(assets, 'android-icon-monochrome.png'));

  const bg1024 = await solidBackground(1024, BRAND_GREEN);
  await writePng(bg1024, path.join(assets, 'android-icon-background.png'));

  const iosSizes = [
    { name: 'Icon-App-1024x1024@1x.png', size: 1024 },
    { name: 'Icon-App-180x180@3x.png', size: 180 },
    { name: 'Icon-App-167x167@2x.png', size: 167 },
    { name: 'Icon-App-152x152@2x.png', size: 152 },
    { name: 'Icon-App-120x120@2x.png', size: 120 },
    { name: 'Icon-App-87x87@3x.png', size: 87 },
    { name: 'Icon-App-80x80@2x.png', size: 80 },
    { name: 'Icon-App-58x58@2x.png', size: 58 },
  ];

  const iosDir = path.join(iconDir, 'AppIcon.appiconset');
  fs.mkdirSync(iosDir, { recursive: true });

  console.log('Generating iOS AppIcon set…');
  for (const { name, size } of iosSizes) {
    await writePng(await renderSvg(fullIconSvg, size), path.join(iosDir, name));
  }

  const iosContents = {
    images: [
      { size: '20x20', idiom: 'iphone', scale: '2x', filename: 'Icon-App-80x80@2x.png' },
      { size: '20x20', idiom: 'iphone', scale: '3x', filename: 'Icon-App-87x87@3x.png' },
      { size: '29x29', idiom: 'iphone', scale: '2x', filename: 'Icon-App-58x58@2x.png' },
      { size: '29x29', idiom: 'iphone', scale: '3x', filename: 'Icon-App-87x87@3x.png' },
      { size: '40x40', idiom: 'iphone', scale: '2x', filename: 'Icon-App-80x80@2x.png' },
      { size: '40x40', idiom: 'iphone', scale: '3x', filename: 'Icon-App-120x120@2x.png' },
      { size: '60x60', idiom: 'iphone', scale: '2x', filename: 'Icon-App-120x120@2x.png' },
      { size: '60x60', idiom: 'iphone', scale: '3x', filename: 'Icon-App-180x180@3x.png' },
      { size: '20x20', idiom: 'ipad', scale: '2x', filename: 'Icon-App-80x80@2x.png' },
      { size: '29x29', idiom: 'ipad', scale: '2x', filename: 'Icon-App-58x58@2x.png' },
      { size: '40x40', idiom: 'ipad', scale: '2x', filename: 'Icon-App-80x80@2x.png' },
      { size: '76x76', idiom: 'ipad', scale: '2x', filename: 'Icon-App-152x152@2x.png' },
      { size: '83.5x83.5', idiom: 'ipad', scale: '2x', filename: 'Icon-App-167x167@2x.png' },
      { size: '1024x1024', idiom: 'ios-marketing', scale: '1x', filename: 'Icon-App-1024x1024@1x.png' },
    ],
    info: { version: 1, author: 'xcode' },
  };
  fs.writeFileSync(path.join(iosDir, 'Contents.json'), JSON.stringify(iosContents, null, 2));

  const androidSizes = [
    { folder: 'drawable-mdpi', size: 48 },
    { folder: 'drawable-hdpi', size: 72 },
    { folder: 'drawable-xhdpi', size: 96 },
    { folder: 'drawable-xxhdpi', size: 144 },
    { folder: 'drawable-xxxhdpi', size: 192 },
  ];

  console.log('Generating Android drawable sets…');
  for (const { folder, size } of androidSizes) {
    const dir = path.join(iconDir, 'android', folder);
    fs.mkdirSync(dir, { recursive: true });
    await writePng(await renderSvg(fullIconSvg, size), path.join(dir, 'ic_launcher.png'));
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
