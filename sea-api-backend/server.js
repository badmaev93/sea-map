const express = require('express');
const cors = require('cors');
const fs = require('fs'); 
const csv = require('csv-parser'); 

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

app.get('/api/data', (req, res) => {
    const results = [];

    fs.createReadStream('data.csv')
      .on('error', (error) => {
        console.error("Ошибка чтения файла:", error);
        res.status(500).json({ error: 'Не удалось прочитать файл с данными' });
      })
      .pipe(csv()) 
      .on('data', (data) => {
        results.push(data);
      })
      .on('end', () => {
        
        const processedResults = results.map(row => ({
            ...row, 
            depth_m: parseFloat(row.depth_m),
            temp_c: parseFloat(row.temp_c),
            salinity_psu: parseFloat(row.salinity_psu),
            oxygen_mgl: parseFloat(row.oxygen_mgl),
            ph: parseFloat(row.ph),
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude)
        }));
        
        res.json(processedResults);
      });
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});