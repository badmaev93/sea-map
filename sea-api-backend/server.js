const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const turf = require('@turf/turf');
const coastline = require('@geo-maps/countries-coastline-1m');

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());

let dataPromise = null;
let coastlinePolygon = null; 

function loadData() {
    try {
        coastlinePolygon = coastline.features[0];
        console.log("Полигон береговой линии успешно загружен из пакета.");
    } catch (error) {
        console.error("Критическая ошибка: Не удалось загрузить полигон из пакета @geo-maps/countries-coastline-1m", error);
    }

    // Загрузка данных из CSV остается без изменений
    return new Promise((resolve, reject) => {
        const results = [];
        const csvFilePath = path.join(__dirname, 'data.csv');

        if (!fs.existsSync(csvFilePath)) {
            console.error(`Критическая ошибка: Файл data.csv не найден по пути ${csvFilePath}`);
            return reject(new Error('CSV file not found'));
        }

        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('error', (error) => reject(error))
            .on('end', () => {
                const processedData = results.map(row => ({
                    ...row,
                    depth_m: parseFloat(row.depth_m),
                    temp_c: parseFloat(row.temp_c),
                    salinity_psu: parseFloat(row.salinity_psu),
                    oxygen_mgl: parseFloat(row.oxygen_mgl),
                    ph: parseFloat(row.ph),
                    latitude: parseFloat(row.latitude),
                    longitude: parseFloat(row.longitude)
                }));
                console.log(`Данные из CSV успешно загружены. Записей: ${processedData.length}`);
                resolve(processedData);
            });
    });
}

dataPromise = loadData().catch(err => {
    console.error("Не удалось загрузить данные при запуске:", err);
    return []; 
});

app.get('/', (req, res) => {
    res.send('API сервер для карты работает!');
});

app.get('/api/data', async (req, res) => {
    try {
        const cachedData = await dataPromise;
        res.json(cachedData);
    } catch (error) {
        res.status(500).json({ error: "Ошибка при получении данных." });
    }
});

// Маршрут для изолиний остается почти без изменений
app.get('/api/isolines', async (req, res) => {
});

app.listen(port, () => {
    console.log(`Сервер успешно запущен и слушает порт ${port}`);
});

app.get('/api/isolines', async (req, res) => {
    const { year, horizon, param, breaks } = req.query;
    if (!year || !horizon || !param || !breaks) { return res.status(400).json({ error: 'Недостаточно параметров' }); }
    try {
        const cachedData = await dataPromise;
        const breakPoints = breaks.split(',').map(parseFloat).filter(isFinite);
        const features = cachedData.filter(p => String(p.date).split('/')[2] === year && String(p.horizon) === horizon && p[param] != null && isFinite(p[param])).map(p => turf.point([p.longitude, p.latitude], { [param]: p[param] }));
        if (features.length < 3) { return res.json({ type: 'FeatureCollection', features: [] }); }
        
        const pointCollection = turf.featureCollection(features);
        const dataValues = features.map(f => f.properties[param]);
        const dataMin = Math.min(...dataValues);
        const dataMax = Math.max(...dataValues);
        const validBreaks = breakPoints.filter(b => b > dataMin && b < dataMax);
        if (validBreaks.length === 0) { return res.json({ type: 'FeatureCollection', features: [] }); }

        const options = { gridSize: 0.1, property: param, units: 'kilometers', weight: 3 };
        const grid = turf.idw(pointCollection, param, options);
        const rawIsolines = turf.isolines(grid, validBreaks, { zProperty: param });

        let clippedIsolines = [];
        if (coastlinePolygon) {
            rawIsolines.features.forEach(line => {
                const clippedLine = turf.difference(line, coastlinePolygon);
                if (clippedLine) {
                    clippedLine.properties = line.properties;
                    clippedIsolines.push(clippedLine);
                }
            });
        } else {
            clippedIsolines = rawIsolines.features;
        }
        
        const finalIsolines = turf.featureCollection(clippedIsolines);
        finalIsolines.features.forEach(feature => {
            feature.properties.value = feature.properties[param];
        });
        
        res.json(finalIsolines);
    } catch (error) {
        console.error(`Ошибка при генерации изолиний для ${param}:`, error);
        res.status(500).json({ error: "Ошибка на сервере при генерации изолиний", details: error.message });
    }
});
