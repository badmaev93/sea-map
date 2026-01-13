const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const turf = require('@turf/turf');
// Важно: убедитесь, что библиотека действительно экспортирует данные в таком формате
// Если это CommonJS модуль, может понадобиться: const { data } = require('@geo-maps/...');
const coastlineData = require('@geo-maps/countries-coastline-1m');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// --- КЭШ ---
// Структура кэша: { '2023_10_temp_c': { isolines: GeoJSON, breaks: [...] } }
const isolinesCache = new Map(); 

/**
 * Загружает и парсит CSV файл.
 * @returns {Promise<Array<Object>>}
 */
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
                    // Добавляем год для удобной фильтрации
                    year: String(row.date).split('/')[2] 
                }));
                console.log(`Данные из CSV успешно загружены. Записей: ${processedData.length}`);
                resolve(processedData);
            });
    });
}

/**
 * Подготавливает полигон береговой линии, обрезая его по области данных.
 * @param {Array<Object>} dataPoints - Точки данных
 * @returns {Object|null} - GeoJSON полигон или null
 */
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
        // Упрощенная и более надежная логика для работы с разными форматами geojson
        const worldCoastlineFeature = turf.feature(coastlineData.features[0].geometry);
        
        const dataBbox = turf.bbox(turf.featureCollection(validPoints));
        // Увеличиваем буфер для надежности
        const bufferedArea = turf.buffer(turf.bboxPolygon(dataBbox), 20, { units: 'kilometers' });
        
        const localCoastline = turf.intersect(worldCoastlineFeature, bufferedArea);

        if (localCoastline) {
            console.log("Полигон береговой линии успешно оптимизирован.");
            return localCoastline;
        } else {
            console.warn("Не удалось оптимизировать полигон, возможно, данные далеко от берега. Будет использоваться полный полигон.");
            return worldCoastlineFeature; // Возвращаем полный полигон как fallback
        }
    } catch (e) {
        console.error("Критическая ошибка при обработке геометрии береговой линии:", e.message);
        return null;
    }
}


/**
 * Функция предварительного расчета и кэширования изолиний.
 * @param {Array<Object>} allData - Все данные из CSV
 * @param {Object|null} coastlinePolygon - Полигон для обрезки
 */
async function precomputeAndCacheIsolines(allData, coastlinePolygon) {
    console.log("Начинаем предварительный расчет и кэширование изолиний...");
    
    const uniqueParams = new Set();
    allData.forEach(p => {
        // Собираем уникальные комбинации год-горизонт
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
                // Недостаточно данных для построения, кэшируем пустой результат
                isolinesCache.set(cacheKey, turf.featureCollection([]));
                continue;
            }

            try {
                // --- ОСНОВНЫЕ ВЫЧИСЛЕНИЯ ---
                const pointCollection = turf.featureCollection(features);

                // Опции для IDW. gridSize - ключевой параметр производительности!
                const options = { gridSize: 0.2, property: param, units: 'kilometers', weight: 2 };
                const grid = turf.idw(pointCollection, param, options);
                
                // Динамически определяем диапазоны для изолиний
                const dataValues = features.map(f => f.properties[param]);
                const dataMin = Math.min(...dataValues);
                const dataMax = Math.max(...dataValues);
                // Генерируем 10 шагов между min и max
                const breaks = Array.from({length: 10}, (_, i) => dataMin + (i * (dataMax - dataMin)) / 9);

                const rawIsolines = turf.isolines(grid, breaks, { zProperty: param });

                let finalIsolines = rawIsolines;
                if (coastlinePolygon) {
                    const clippedFeatures = [];
                     rawIsolines.features.forEach(line => {
                        try {
                            const clippedLine = turf.difference(line, coastlinePolygon);
                            if (clippedLine) {
                                clippedLine.properties = line.properties; // Копируем свойства
                                clippedFeatures.push(clippedLine);
                            }
                        } catch (clipError) {
                           // Если обрезка не удалась, добавляем оригинальную линию
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
                isolinesCache.set(cacheKey, turf.featureCollection([])); // Кэшируем пустой результат при ошибке
            }
        }
    }
    console.log(`Предварительный расчет завершен. Записей в кэше: ${isolinesCache.size}`);
}


/**
 * Главная функция запуска сервера
 */
async function startServer() {
    try {
        const allData = await loadData();
        const localCoastline = getLocalCoastline(allData);

        // Запускаем тяжелые вычисления в фоне, не блокируя старт сервера
        precomputeAndCacheIsolines(allData, localCoastline).catch(err => {
            console.error("Не удалось завершить кэширование:", err);
        });
        
        app.get('/', (req, res) => res.send('API сервер для карты работает!'));
        
        // Этот эндпоинт теперь не нужен, если все данные передаются через кэш изолиний
        // но оставим его для отладки
        app.get('/api/data', (req, res) => res.json(allData));

        app.get('/api/isolines', (req, res) => {
            const { year, horizon, param } = req.query;

            // Валидация параметров
            if (!year || !horizon || !param) {
                return res.status(400).json({
                    error: 'Недостаточно параметров: требуются year, horizon, param'
                });
            }

            // Валидация допустимых значений параметра
            const validParams = ['temp_c', 'salinity_psu', 'oxygen_mgl', 'ph'];
            if (!validParams.includes(param)) {
                return res.status(400).json({
                    error: `Недопустимый параметр. Допустимые значения: ${validParams.join(', ')}`
                });
            }

            // Валидация горизонта
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

        // Обработчик несуществующих маршрутов
        app.use((req, res) => {
            res.status(404).json({
                error: 'Маршрут не найден',
                path: req.path
            });
        });

        // Middleware для обработки ошибок
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
