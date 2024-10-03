require('dotenv').config()
const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const AdmZip = require('adm-zip');
const cors = require('cors'); // Import cors
const axios = require('axios'); // Import axios

const app = express();
const PORT = 3500;

// Enable CORS for all routes
app.use(cors());
app.use(express.json()); // To parse JSON bodies

// File upload setup using Multer
const upload = multer({ dest: 'uploads/' });

// Function to register all fonts from the local fonts directory
const loadAndRegisterFonts = () => {
  const fontsDir = path.join(__dirname, 'fonts');

  // Check if fonts directory exists
  if (!fs.existsSync(fontsDir)) {
    console.error(`Fonts directory not found: ${fontsDir}`);
    return;
  }

  // Read all font files in the fonts directory
  const fontFiles = fs.readdirSync(fontsDir);
  
  fontFiles.forEach(file => {
    // Ensure that the file is a .ttf or .otf font file
    if (file.endsWith('.ttf') || file.endsWith('.otf')) {
      const fontPath = path.join(fontsDir, file);
      const fontFamily = path.basename(file, path.extname(file)); // Get the font family name from the file name
      registerFont(fontPath, { family: fontFamily });
      console.log(`Registered font: ${fontFamily}`);
    }
  });
};

// Endpoint to fetch Google Fonts
app.get('/fonts', async (req, res) => {
  try {
    const apiKey = process.env.APIKEY 
    
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

// Certificate generation and ZIP file download route
app.post(
  '/generate-certificates',
  upload.fields([{ name: 'template', maxCount: 1 }, { name: 'participants', maxCount: 1 }]),
  async (req, res) => {
    try {
      // Ensure files are uploaded properly
      if (!req.files || !req.files.template || !req.files.participants) {
        return res.status(400).json({ error: 'Please upload both the template and participants files.' });
      }

      const templatePath = req.files.template[0].path;
      const participantsPath = req.files.participants[0].path;

      // Check if the template file exists
      if (!fs.existsSync(templatePath)) {
        return res.status(400).json({ error: 'Template file does not exist.' });
      }

      // Check if the participants file exists
      if (!fs.existsSync(participantsPath)) {
        return res.status(400).json({ error: 'Participants file does not exist.' });
      }

      // Load customization settings from the request body
      const { fontFamily = 'Lato', fontSize = 80, fontColor = 'gold', xPosition = 0, yPosition = 0 } = req.body;

      // Load all fonts from the local directory
      loadAndRegisterFonts(); // Load all fonts from the fonts directory

      // Load the certificate template image
      const template = await loadImage(templatePath);

      // Read participant names from the uploaded file
      const participantNames = fs.readFileSync(participantsPath, 'utf-8').split('\n').filter(Boolean);

      if (participantNames.length === 0) {
        return res.status(400).json({ error: 'The participants list is empty.' });
      }

      // Create a directory to store generated certificates
      const certificatesDir = path.join(__dirname, 'certificates/');
      if (!fs.existsSync(certificatesDir)) {
        fs.mkdirSync(certificatesDir);
      }

      // Generate certificates for each participant
      for (let name of participantNames) {
        name = name.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

        const canvas = createCanvas(template.width, template.height);
        const ctx = canvas.getContext('2d');

        // Draw the template image onto the canvas
        ctx.drawImage(template, 0, 0, template.width, template.height);

        // Set the font and draw the participant's name
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillStyle = fontColor;

        const textWidth = ctx.measureText(name).width;
        const adjustedXPosition = parseInt(xPosition, 10) || (template.width - textWidth) / 2;
        const adjustedYPosition = parseInt(yPosition, 10) || yPosition;

        ctx.fillText(name, adjustedXPosition, adjustedYPosition);

        // Save the generated certificate
        const certPath = path.join(certificatesDir, `${name}.png`);
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(certPath, buffer);
      }

      // Create a ZIP file containing all the generated certificates
      const zip = new AdmZip();
      fs.readdirSync(certificatesDir).forEach(file => {
        zip.addLocalFile(path.join(certificatesDir, file));
      });

      // Save the ZIP file temporarily
      const zipPath = path.join(__dirname, 'certificates.zip');
      zip.writeZip(zipPath);

      // Send the ZIP file to the user for download
      res.download(zipPath, 'certificates.zip', (err) => {
        if (err) {
          console.error('Error sending ZIP file:', err);
          res.status(500).send('An error occurred while downloading the ZIP file.');
        }

        // Clean up generated files after sending ZIP
        try {
         
          fs.removeSync(certificatesDir); // Clean up the entire certificates directory
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
