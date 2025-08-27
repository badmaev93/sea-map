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

async function loadAndProcessData() {
    return new Promise((resolve, reject) => {
        const results = [];
        const csvFilePath = path.join(__dirname, 'data.csv');
        if (!fs.existsSync(csvFilePath)) {
            return reject(new Error(`Критическая ошибка: Файл data.csv не найден по пути ${csvFilePath}`));
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

async function startServer() {
    try {
        const cachedData = await loadAndProcessData();
        
        let localCoastlinePolygon = null;
        if (cachedData.length > 0) {
            console.log("Оптимизируем полигон береговой линии...");
            const dataPoints = turf.featureCollection(cachedData.map(p => turf.point([p.longitude, p.latitude])));
            const dataBbox = turf.bbox(dataPoints);
            // Создаем буфер вокруг данных, чтобы захватить ближайший берег
            const bufferedArea = turf.buffer(turf.bboxPolygon(dataBbox), 10, { units: 'kilometers' });
            
            // Обрезаем гигантский мировой полигон до нашего маленького региона
            localCoastlinePolygon = turf.intersect(coastline[0], bufferedArea);
            if (localCoastlinePolygon) {
                console.log("Полигон береговой линии успешно оптимизирован.");
            } else {
                console.warn("Не удалось оптимизировать полигон, возможно, данные далеко от берега.");
                localCoastlinePolygon = coastline[0]; // Используем глобальный как запасной вариант
            }
        }
        app.get('/', (req, res) => res.send('API сервер для карты работает!'));
        app.get('/api/data', (req, res) => res.json(cachedData));

        app.get('/api/isolines', (req, res) => {
            const { year, horizon, param, breaks } = req.query;
            if (!year || !horizon || !param || !breaks) return res.status(400).json({ error: 'Недостаточно параметров' });
            
            try {
                const breakPoints = breaks.split(',').map(parseFloat).filter(isFinite);
                const features = cachedData
                    .filter(p => String(p.date).split('/')[2] === year && String(p.horizon) === horizon && p[param] != null && isFinite(p[param]))
                    .map(p => turf.point([p.longitude, p.latitude], { [param]: p[param] }));

                if (features.length < 3) return res.json({ type: 'FeatureCollection', features: [] });
                
                const pointCollection = turf.featureCollection(features);
                const dataValues = features.map(f => f.properties[param]);
                const dataMin = Math.min(...dataValues);
                const dataMax = Math.max(...dataValues);
                const validBreaks = breakPoints.filter(b => b > dataMin && b < dataMax);

                if (validBreaks.length === 0) return res.json({ type: 'FeatureCollection', features: [] });

                const options = { gridSize: 0.1, property: param, units: 'kilometers', weight: 3 };
                const grid = turf.idw(pointCollection, param, options);
                const rawIsolines = turf.isolines(grid, validBreaks, { zProperty: param });

                let clippedIsolines = [];
                if (localCoastlinePolygon) {
                    rawIsolines.features.forEach(line => {
                        const clippedLine = turf.difference(line, localCoastlinePolygon);
                        if (clippedLine) {
                            clippedLine.properties = line.properties;
                            clippedIsolines.push(clippedLine);
                        }
                    });
                } else {
                    clippedIsolines = rawIsolines.features;
                }
                
                const finalIsolines = turf.featureCollection(clippedIsolines);
                finalIsolines.features.forEach(feature => { feature.properties.value = feature.properties[param]; });
                
                res.json(finalIsolines);
            } catch (error) {
                console.error(`Ошибка при генерации изолиний для ${param}:`, error);
                res.status(500).json({ error: "Ошибка на сервере при генерации изолиний", details: error.message });
            }
        });

        app.listen(port, () => {
            console.log(`Сервер успешно запущен и слушает порт ${port}`);
        });

    } catch (error) {
        console.error("Критическая ошибка при запуске сервера:", error);
        process.exit(1);
    }
}

startServer();
