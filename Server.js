require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const AdmZip = require('adm-zip');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3500;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const loadAndRegisterFonts = () => {
  const fontsDir = path.join(__dirname, 'fonts');

  if (!fs.existsSync(fontsDir)) {
    console.error(`Fonts directory not found: ${fontsDir}`);
    return;
  }

  const fontFiles = fs.readdirSync(fontsDir);
  
  fontFiles.forEach(file => {
    if (file.endsWith('.ttf') || file.endsWith('.otf')) {
      const fontPath = path.join(fontsDir, file);
      const fontFamily = path.basename(file, path.extname(file));
      registerFont(fontPath, { family: fontFamily });
      console.log(`Registered font: ${fontFamily}`);
    }
  });
};

app.get('/fonts', async (req, res) => {
  try {
    const apiKey = process.env.APIKEY;
    const apiUrl = `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}`;
    const response = await axios.get(apiUrl);
    const fonts = response.data.items.map(font => ({
      family: font.family,
      variants: font.variants,
    }));
    res.json(fonts);
  } catch (error) {
    console.error('Error fetching fonts from Google API:', error);
    res.status(500).json({ error: 'Failed to fetch fonts.' });
  }
});

app.post(
  '/generate-certificates',
  upload.fields([{ name: 'template', maxCount: 1 }, { name: 'participants', maxCount: 1 }]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.template || !req.files.participants) {
        return res.status(400).json({ error: 'Please upload both the template and participants files.' });
      }

      const templatePath = req.files.template[0].path;
      const participantsPath = req.files.participants[0].path;

      if (!fs.existsSync(templatePath)) {
        return res.status(400).json({ error: 'Template file does not exist.' });
      }

      if (!fs.existsSync(participantsPath)) {
        return res.status(400).json({ error: 'Participants file does not exist.' });
      }

      const { fontFamily = 'Lato', fontSize = 80, fontColor = 'gold', xPosition = 0, yPosition = 0 } = req.body;

      loadAndRegisterFonts();

      const template = await loadImage(templatePath);

      const participantNames = fs.readFileSync(participantsPath, 'utf-8').split('\n').filter(Boolean);

      if (participantNames.length === 0) {
        return res.status(400).json({ error: 'The participants list is empty.' });
      }

      const certificatesDir = path.join(__dirname, 'certificates/');
      if (!fs.existsSync(certificatesDir)) {
        fs.mkdirSync(certificatesDir);
      }

      for (let name of participantNames) {
        name = name.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

        const canvas = createCanvas(template.width, template.height);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(template, 0, 0, template.width, template.height);

        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillStyle = fontColor;

        const adjustedXPosition = parseInt(xPosition, 10);
        const adjustedYPosition = parseInt(yPosition, 10);

        ctx.fillText(name, adjustedXPosition, adjustedYPosition);

        const certPath = path.join(certificatesDir, `${name}.png`);
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(certPath, buffer);
      }

      const zip = new AdmZip();
      fs.readdirSync(certificatesDir).forEach(file => {
        zip.addLocalFile(path.join(certificatesDir, file));
      });

      const zipPath = path.join(__dirname, 'certificates.zip');
      zip.writeZip(zipPath);

      res.download(zipPath, 'certificates.zip', (err) => {
        if (err) {
          console.error('Error sending ZIP file:', err);
          res.status(500).send('An error occurred while downloading the ZIP file.');
        }

        try {
          const uploadsDir = path.join(__dirname, 'uploads');
          fs.emptyDirSync(uploadsDir);
          
          fs.removeSync(certificatesDir);
          fs.removeSync(zipPath);
        } catch (cleanupError) {
          console.error('Error during cleanup:', cleanupError);
        }
      });
    } catch (error) {
      console.error('Error generating certificates:', error);
      if (!res.headersSent) {
        res.status(500).send('An error occurred while generating certificates.');
      }
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});