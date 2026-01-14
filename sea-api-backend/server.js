const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const turf = require('@turf/turf');
const coastlineData = require('@geo-maps/countries-coastline-1m');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const isolinesCache = new Map();

function loadData() {
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
                    longitude: parseFloat(row.longitude),
                    year: String(row.date).split('/')[2] 
                }));
                console.log(`Данные из CSV успешно загружены. Записей: ${processedData.length}`);
                resolve(processedData);
            });
    });
}

function getLocalCoastline(dataPoints) {
    console.log("Оптимизируем полигон береговой линии...");
    const validPoints = dataPoints
        .filter(p => isFinite(p.longitude) && isFinite(p.latitude))
        .map(p => turf.point([p.longitude, p.latitude]));

    if (validPoints.length === 0) {
        console.error("В данных нет ни одной точки с корректными координатами.");
        return null;
    }

    try {
        const worldCoastlineFeature = turf.feature(coastlineData.features[0].geometry);

        const dataBbox = turf.bbox(turf.featureCollection(validPoints));
        const bufferedArea = turf.buffer(turf.bboxPolygon(dataBbox), 20, { units: 'kilometers' });
        
        const localCoastline = turf.intersect(worldCoastlineFeature, bufferedArea);

        if (localCoastline) {
            console.log("Полигон береговой линии успешно оптимизирован.");
            return localCoastline;
        } else {
            console.warn("Не удалось оптимизировать полигон, возможно, данные далеко от берега. Будет использоваться полный полигон.");
            return worldCoastlineFeature;
        }
    } catch (e) {
        console.error("Критическая ошибка при обработке геометрии береговой линии:", e.message);
        return null;
    }
}


async function precomputeAndCacheIsolines(allData, coastlinePolygon) {
    console.log("Начинаем предварительный расчет и кэширование изолиний...");
    
    const uniqueParams = new Set();
    allData.forEach(p => {
        if (p.year && p.horizon) {
            uniqueParams.add(`${p.year}_${p.horizon}`);
        }
    });

    const parameters = ['temp_c', 'salinity_psu', 'oxygen_mgl', 'ph'];

    for (const combo of uniqueParams) {
        const [year, horizon] = combo.split('_');
        for (const param of parameters) {
            const cacheKey = `${year}_${horizon}_${param}`;
            
            const features = allData
                .filter(p => p.year === year && String(p.horizon) === horizon && p[param] != null && isFinite(p[param]) && isFinite(p.longitude) && isFinite(p.latitude))
                .map(p => turf.point([p.longitude, p.latitude], { [param]: p[param] }));

            if (features.length < 3) {
                isolinesCache.set(cacheKey, turf.featureCollection([]));
                continue;
            }

            try {
                const pointCollection = turf.featureCollection(features);

                const options = { gridSize: 0.2, property: param, units: 'kilometers', weight: 2 };
                const grid = turf.idw(pointCollection, param, options);

                const dataValues = features.map(f => f.properties[param]);
                const dataMin = Math.min(...dataValues);
                const dataMax = Math.max(...dataValues);
                const breaks = Array.from({length: 10}, (_, i) => dataMin + (i * (dataMax - dataMin)) / 9);

                const rawIsolines = turf.isolines(grid, breaks, { zProperty: param });

                let finalIsolines = rawIsolines;
                if (coastlinePolygon) {
                    const clippedFeatures = [];
                     rawIsolines.features.forEach(line => {
                        try {
                            const clippedLine = turf.difference(line, coastlinePolygon);
                            if (clippedLine) {
                                clippedLine.properties = line.properties;
                                clippedFeatures.push(clippedLine);
                            }
                        } catch (clipError) {
                           clippedFeatures.push(line);
                        }
                    });
                    finalIsolines = turf.featureCollection(clippedFeatures);
                }

                finalIsolines.features.forEach(feature => {
                    feature.properties.value = feature.properties[param];
                });

                isolinesCache.set(cacheKey, finalIsolines);

            } catch (error) {
                console.error(`Ошибка при кэшировании ${cacheKey}:`, error.message);
                isolinesCache.set(cacheKey, turf.featureCollection([]));
            }
        }
    }
    console.log(`Предварительный расчет завершен. Записей в кэше: ${isolinesCache.size}`);
}


async function startServer() {
    try {
        const allData = await loadData();
        const localCoastline = getLocalCoastline(allData);

        precomputeAndCacheIsolines(allData, localCoastline).catch(err => {
            console.error("Не удалось завершить кэширование:", err);
        });
        
        app.get('/', (req, res) => res.send('API сервер для карты работает!'));

        app.get('/api/data', (req, res) => res.json(allData));

        app.get('/api/isolines', (req, res) => {
            const { year, horizon, param } = req.query;

            if (!year || !horizon || !param) {
                return res.status(400).json({
                    error: 'Недостаточно параметров: требуются year, horizon, param'
                });
            }

            const validParams = ['temp_c', 'salinity_psu', 'oxygen_mgl', 'ph'];
            if (!validParams.includes(param)) {
                return res.status(400).json({
                    error: `Недопустимый параметр. Допустимые значения: ${validParams.join(', ')}`
                });
            }

            const validHorizons = ['0', 'дно'];
            if (!validHorizons.includes(horizon)) {
                return res.status(400).json({
                    error: `Недопустимый горизонт. Допустимые значения: ${validHorizons.join(', ')}`
                });
            }

            const cacheKey = `${year}_${horizon}_${param}`;

            if (isolinesCache.has(cacheKey)) {
                console.log(`Запрос изолиний: ${cacheKey} - данные найдены в кэше`);
                res.json(isolinesCache.get(cacheKey));
            } else {
                console.log(`Запрос изолиний: ${cacheKey} - данные не найдены`);
                res.status(404).json({
                    error: 'Данные для указанных параметров не найдены или еще не обработаны.',
                    requested: { year, horizon, param }
                });
            }
        });

        app.use((req, res) => {
            res.status(404).json({
                error: 'Маршрут не найден',
                path: req.path
            });
        });

        app.use((err, req, res, next) => {
            console.error('Ошибка сервера:', err);
            res.status(500).json({
                error: 'Внутренняя ошибка сервера',
                message: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        });

        app.listen(port, () => {
            console.log(`Сервер успешно запущен и слушает порт ${port}`);
            console.log(`Доступные эндпоинты:`);
            console.log(`  GET /api/data - получить все данные`);
            console.log(`  GET /api/isolines?year=YYYY&horizon=0|дно&param=temp_c|salinity_psu|oxygen_mgl|ph`);
            console.log("Кэширование изолиний происходит в фоновом режиме.");
        });

    } catch (error) {
        console.error("Критическая ошибка при запуске сервера:", error);
        process.exit(1);
    }
}

startServer();
