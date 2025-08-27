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

function loadAndProcessData() {
    const csvFilePath = path.join(__dirname, 'data.csv');

    if (!fs.existsSync(csvFilePath)) {
        console.error(`Критическая ошибка: Файл data.csv не найден по пути ${csvFilePath}`);

        return; 
    }

    const fileContent = fs.readFileSync(csvFilePath, 'utf8');
    const results = [];
    
    const readableStream = require('stream').Readable.from(fileContent);
    readableStream
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
            console.log(`Данные из CSV успешно загружены. Записей: ${cachedData.length}`);
        });
}

loadAndProcessData();

app.get('/', (req, res) => {
    res.send('API сервер для карты работает!');
});

app.get('/api/data', (req, res) => {
    res.json(cachedData);
});

app.get('/api/isolines', (req, res) => {
});

app.listen(port, () => {
    console.log(`Сервер успешно запущен и слушает порт ${port}`);
});

app.get('/api/isolines', (req, res) => {
    const { year, horizon, param, breaks } = req.query;
    if (!year || !horizon || !param || !breaks) { return res.status(400).json({ error: 'Недостаточно параметров для генерации изолиний' }); }
    const breakPoints = breaks.split(',').map(parseFloat).filter(isFinite);
    const features = cachedData.filter(p => String(p.date).split('/')[2] === year && String(p.horizon) === horizon && p[param] != null && isFinite(p[param])).map(p => turf.point([p.longitude, p.latitude], { [param]: p[param] }));
    if (features.length < 3) { return res.json({ type: 'FeatureCollection', features: [] }); }
    try {
        const dataValues = features.map(f => f.properties[param]);
        const dataMin = Math.min(...dataValues);
        const dataMax = Math.max(...dataValues);
        const validBreaks = breakPoints.filter(b => b > dataMin && b < dataMax);
        if (validBreaks.length === 0) { return res.json({ type: 'FeatureCollection', features: [] }); }
        const tin = turf.tin({ type: 'FeatureCollection', features }, param);
        const isolines = turf.isolines(tin, validBreaks, { zProperty: param });
        isolines.features.forEach(feature => { feature.properties.value = feature.properties[param]; });
        res.json(isolines);
    } catch (error) {
        console.error(`Критическая ошибка при генерации изолиний для ${param}:`, error);
        res.status(500).json({ error: "Внутренняя ошибка сервера при генерации изолиний", details: error.message });
    }
});
