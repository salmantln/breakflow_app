// scripts/generate-icons-debug.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const inputImage = path.join(__dirname, '../resources/original-clock.png');
const outputDir = path.join(__dirname, '../public/icons');

async function checkEnvironment() {
  console.log('Current working directory:', process.cwd());
  console.log('Script directory:', __dirname);
  console.log('Input image path:', inputImage);
  console.log('Output directory:', outputDir);
  
  try {
    const stats = await fs.stat(inputImage);
    console.log('Image exists:', stats.isFile());
    console.log('Image size:', stats.size);
  } catch (error) {
    console.log('Image check failed:', error.message);
  }
}

async function generateIcons() {
  try {
    await checkEnvironment();
    
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate one test icon first
    const testSize = 32;
    console.log(`Generating test icon ${testSize}x${testSize}...`);
    
    await sharp(inputImage)
      .resize(testSize, testSize)
      .png()
      .toFile(path.join(outputDir, `icon-${testSize}x${testSize}.png`));
      
    console.log('Test icon generated successfully!');
    
    // Ask if you want to continue
    console.log('\nCheck the test icon. Generate remaining sizes? (Ctrl+C to cancel)');
    
    // Wait for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Generate remaining sizes
    for (const size of sizes) {
      if (size === testSize) continue;
      console.log(`Generating ${size}x${size}...`);
      await sharp(inputImage)
        .resize(size, size)
        .png()
        .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
    }
    
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

generateIcons();