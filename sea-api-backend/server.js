const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());

let cachedData = [];

function loadData() {
    const results = [];
    const csvFilePath = path.join(__dirname, 'data.csv');

    if (!fs.existsSync(csvFilePath)) {
        console.error('Критическая ошибка: Файл data.csv не найден!');
        return;
    }

    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            cachedData = results.map(row => ({
                ...row,
                depth_m: parseFloat(row.depth_m),
                temp_c: parseFloat(row.temp_c),
                salinity_psu: parseFloat(row.salinity_psu),
                oxygen_mgl: parseFloat(row.oxygen_mgl),
                ph: parseFloat(row.ph),
                latitude: parseFloat(row.latitude),
                longitude: parseFloat(row.longitude)
            }));
            console.log(`Данные из CSV успешно загружены и кэшированы. Записей: ${cachedData.length}`);
        });
}

// Маршрут для проверки, что сервер работает
app.get('/', (req, res) => {
    res.send('API сервер для карты работает!');
});

// Основной маршрут для данных
app.get('/api/data', (req, res) => {
    if (cachedData.length === 0) {
        return res.status(503).json({ error: "Данные еще не загружены, попробуйте через несколько секунд." });
    }
    res.json(cachedData);
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
    loadData();
});