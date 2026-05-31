const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Iniciando script de otimização de imagens...');
  
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('Biblioteca "sharp" não encontrada. Por favor, instale-a executando "npm install sharp" antes de rodar este script.');
    process.exit(1);
  }

  const imagesToOptimize = [
    {
      input: 'rodrigo-m.jpg',
      outputName: 'rodrigo-m-opt.webp'
    },
    {
      input: 'camila.jpg',
      outputName: 'camila-opt.webp'
    },
    {
      input: 'anderson.webp',
      outputName: 'anderson-opt.webp'
    }
  ];

  for (const img of imagesToOptimize) {
    const inputPath = path.join(__dirname, img.input);
    if (!fs.existsSync(inputPath)) {
      console.warn(`Aviso: Arquivo de entrada não encontrado: ${inputPath}`);
      continue;
    }

    const outputRootPath = path.join(__dirname, img.outputName);
    const outputPublicPath = path.join(__dirname, 'public', img.outputName);

    try {
      console.log(`Otimizando ${img.input} -> ${img.outputName}...`);
      
      // Redimensiona para 200x200 pixels e comprime como WebP (qualidade 80%)
      const processedBuffer = await sharp(inputPath)
        .resize(200, 200, {
          fit: 'cover',
          position: 'top'
        })
        .webp({ quality: 80 })
        .toBuffer();

      // Salva no root
      fs.writeFileSync(outputRootPath, processedBuffer);
      console.log(`✓ Salvo no root: ${img.outputName} (${(processedBuffer.length / 1024).toFixed(2)} KB)`);

      // Salva no public/
      const publicDir = path.join(__dirname, 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(outputPublicPath, processedBuffer);
      console.log(`✓ Salvo em public/: ${img.outputName}`);

    } catch (err) {
      console.error(`Erro ao processar ${img.input}:`, err);
    }
  }

  console.log('Otimização concluída!');
}

run();
