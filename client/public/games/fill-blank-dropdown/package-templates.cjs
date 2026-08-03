const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// We assume JSZip is not necessarily installed globally or locally here, 
// so we'll just write a quick script that uses the built-in Compress-Archive in PowerShell.
// Actually, since we're in Node, we can generate a powershell script.

const baseDir = __dirname;
const engineDir = path.join(baseDir, 'engine');
const formSchemaPath = path.join(baseDir, 'form-schema.json');
const manifestPath = path.join(baseDir, 'manifest.json');
const outputDir = path.join(baseDir, 'dist');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const originalManifestStr = fs.readFileSync(manifestPath, 'utf8');
const formSchemaStr = fs.readFileSync(formSchemaPath, 'utf8');

const variants = [
  {
    slug: 'grammar-fill-in',
    manifest: {
      name: "Grammar Fill-In",
      description: "Test grammar skills by filling in the blanks in sentences.",
      category: "language",
      tags: ["grammar", "fill-blank"]
    }
  },
  {
    slug: 'equation-completer',
    manifest: {
      name: "Equation Completer",
      description: "Complete mathematical equations by filling in the missing operators or operands.",
      category: "math",
      tags: ["math", "equations", "fill-blank"]
    }
  },
  {
    slug: 'cloze-reading',
    manifest: {
      name: "Cloze Reading",
      description: "Test reading comprehension by filling in missing words in a passage.",
      category: "reading",
      tags: ["reading", "cloze", "fill-blank"]
    }
  }
];

variants.forEach(variant => {
  const variantDir = path.join(baseDir, `temp-${variant.slug}`);
  
  if (fs.existsSync(variantDir)) {
    fs.rmSync(variantDir, { recursive: true, force: true });
  }
  fs.mkdirSync(variantDir);

  // Copy engine
  const targetEngineDir = path.join(variantDir, 'engine');
  fs.mkdirSync(targetEngineDir);
  fs.readdirSync(engineDir).forEach(file => {
    fs.copyFileSync(path.join(engineDir, file), path.join(targetEngineDir, file));
  });

  // Copy form-schema
  fs.copyFileSync(formSchemaPath, path.join(variantDir, 'form-schema.json'));

  // Create merged manifest
  const originalManifest = JSON.parse(originalManifestStr);
  const newManifest = { ...originalManifest, ...variant.manifest };
  fs.writeFileSync(path.join(variantDir, 'manifest.json'), JSON.stringify(newManifest, null, 2));

  // Zip it
  const zipPath = path.join(outputDir, `${variant.slug}.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  console.log(`Zipping ${variant.slug}...`);
  try {
    // Requires PowerShell Compress-Archive
    execSync(`powershell.exe -NoProfile -Command "Compress-Archive -Path '${variantDir}/*' -DestinationPath '${zipPath}' -Force"`);
    console.log(`Created ${zipPath}`);
  } catch (err) {
    console.error(`Error zipping ${variant.slug}:`, err.message);
  }

  // Cleanup temp dir
  fs.rmSync(variantDir, { recursive: true, force: true });
});

console.log('All variants packaged.');
