// scripts/generate-icons.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const pngToIco = require('png-to-ico');

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const inputImage = path.join(__dirname, '../resources/original-clock.png');
const outputDir = path.join(__dirname, '../public/icons');

async function generateWindowsIcon() {
  try {
    // Generate temporary PNG files for ico conversion
    const pngPaths = [];
    for (const size of [16, 32, 48, 256]) {
      const tempPath = path.join(outputDir, `temp-${size}.png`);
      await sharp(inputImage)
        .resize(size, size)
        .png()
        .toFile(tempPath);
      pngPaths.push(tempPath);
    }

    // Convert to ICO
    const icoBuffer = await pngToIco(pngPaths);
    await fs.writeFile(path.join(outputDir, 'icon.ico'), icoBuffer);

    // Clean up temporary files
    for (const tempPath of pngPaths) {
      await fs.unlink(tempPath);
    }

    console.log('Generated ICO file');
  } catch (error) {
    console.error('Error generating ICO:', error);
  }
}

async function generateIcons() {
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    console.log('Created output directory:', outputDir);

    // Generate PNG icons
    for (const size of sizes) {
      const outputFile = path.join(outputDir, `icon-${size}x${size}.png`);
      await sharp(inputImage)
        .resize(size, size)
        .png()
        .toFile(outputFile);
      console.log(`Generated ${size}x${size} PNG icon`);
    }

    // Generate Windows ICO file
    await generateWindowsIcon();

    // Create main icon file
    await sharp(inputImage)
      .resize(512, 512)
      .png()
      .toFile(path.join(outputDir, 'icon.png'));
    console.log('Generated main icon.png');

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

async function setup() {
  try {
    // Create resources directory if it doesn't exist
    const resourcesDir = path.join(__dirname, '../resources');
    await fs.mkdir(resourcesDir, { recursive: true });

    // Create public/icons directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });

    console.log('Directory structure created');
    console.log('Please place your original-clock.png in the resources folder');

    // Check if image exists
    try {
      await fs.access(inputImage);
      console.log('Found original image, generating icons...');
      await generateIcons();
    } catch (error) {
      console.log('\nERROR: original-clock.png not found!');
      console.log(`Please place your clock image at: ${inputImage}`);
    }
  } catch (error) {
    console.error('Setup failed:', error);
  }
}

// Run the script
setup().catch(console.error);