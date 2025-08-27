const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const turf = require('@turf/turf');

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

app.get('/api/data', (req, res) => {
    res.json(cachedData);
});

app.get('/api/isolines', (req, res) => {
    const { year, horizon, param, breaks } = req.query;

    if (!year || !horizon || !param || !breaks) {
        return res.status(400).json({ error: 'Недостаточно параметров для генерации изолиний' });
    }
    
    const breakPoints = breaks.split(',').map(parseFloat);

    const features = cachedData
        .filter(p => String(p.date).split('/')[2] === year && String(p.horizon) === horizon && p[param] != null)
        .map(p => turf.point([p.longitude, p.latitude], { [param]: p[param] }));

    if (features.length < 3) {
        return res.json({ type: 'FeatureCollection', features: [] });
    }

    try {
        const tin = turf.tin({ type: 'FeatureCollection', features }, param);
        const isolines = turf.isolines(tin, breakPoints, { zProperty: param });
        
        isolines.features.forEach(feature => {
            feature.properties.value = feature.properties[param];
        });

        res.json(isolines);
    } catch (error) {
        console.error("Ошибка при генерации изолиний:", error.message);
        res.status(500).json({ error: "Внутренняя ошибка сервера при генерации изолиний" });
    }
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
    loadData();
});