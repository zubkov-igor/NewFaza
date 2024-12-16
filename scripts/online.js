const { ipcRenderer } = require('electron');
const chartjs = require('chart.js');
const fs = require('fs');
const path = require('path');
const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();
const annotationPlugin = require('chartjs-plugin-annotation');
const {
    Chart,
    LinearScale,
    LineController,
    CategoryScale,
    PointElement,
    LineElement,
    Legend,
    Tooltip
} = chartjs;

Chart.register([LinearScale, LineController, CategoryScale, PointElement, LineElement, Legend, Tooltip]);

let onlineChart;
let chartConfig = {};
const configFilePath = path.join(__dirname, 'settings/settings.json');
const time = [];
const datasets = [];
let isChartRunning = false; // Флаг для отслеживания состояния графика
const statusButton = document.getElementById('statusButton');
let csvFilePath = ''; // Переменная для хранения пути к CSV-файлу
let writeHead = true; // Объявление переменной для заголовка CSV
let updateInterval;

// Загрузка конфигурации графиков
try {
    const configData = fs.readFileSync(configFilePath, 'utf-8');
    chartConfig = JSON.parse(configData);
} catch (error) {
    console.error('Ошибка загрузки конфигурации графиков:', error);
}

// Функция для обновления цвета кнопки
function updateButtonColor(isConnected) {
    statusButton.style.background = isConnected 
        ? 'radial-gradient(farthest-side at top left, #47CF73, #aceac0)' 
        : 'radial-gradient(farthest-side at top left, #ff6347, #ffa494)';
    statusButton.disabled = !isConnected;
}

// Подключение к устройству Modbus TCP
async function connectModbus() {
    try {
       // await client.connectTCP("186.168.65.6", { port: 502 });
        await client.connectTCP("localhost", { port: 502 });
        client.setID(1);
        updateButtonColor(true);
    } catch (error) {
        console.log('Ошибка подключения:', error);
        isConnected = false;
        updateButtonColor(false);
    }
}

// Проверка соединения каждые 5 секунд
setInterval(async () => {
    try {
        await client.readHoldingRegisters(547, 1);
        updateButtonColor(true);
    } catch (error) {
        console.log('Проблема с соединением:', error);
        updateButtonColor(false);
        await sleep(1000);
        client.close();
        connectModbus();
    }
}, 5000);

// Инициируем подключение
connectModbus();

async function readModbusData(client, address) {
    try {
        const data = await client.readHoldingRegisters(address, 2);
        let buf = Buffer.allocUnsafe(4);
        buf[0] = data.data[0] & 0xFF;
        buf[1] = data.data[0] >> 8;
        buf[2] = data.data[1] & 0xFF;
        buf[3] = data.data[1] >> 8;
        return buf.readFloatLE(0).toFixed(2);
    } catch (error) {
        console.error('Ошибка чтения данных Modbus:', error);
        return null;
    }
}

async function updateChartWithModbusData(chart, client) {
    const dataMap = {
        'ДавЛевНас': await readModbusData(client, 500),
        'ДавПравНас': await readModbusData(client, 502),
        'ДавВыход': await readModbusData(client, 504),
        'РасходЛевНас': await readModbusData(client, 506),
        'РасходПравНас': await readModbusData(client, 508),
        'РасходВыход': await readModbusData(client, 510),
        'ТемпРецирк': await readModbusData(client, 512),
        'ДавРецирк': await readModbusData(client, 514),
        'ОбъемВыход': await readModbusData(client, 516),
        'РасходВоды': await readModbusData(client, 518),
        'Плотность': await readModbusData(client, 520),
    };

    for (const chartName in dataMap) {
        if (shouldDrawChart(chartName)) {
            let dataset = chart.data.datasets.find(ds => ds.label === chartName);
            if (dataset) {
                dataset.data.push(dataMap[chartName]);
            } else {
                chart.data.datasets.push({
                    label: chartName,
                    data: [dataMap[chartName]],
                    backgroundColor: chartConfig[chartName].color,
                    borderColor: chartConfig[chartName].color,
                    fill: false,
                    yAxisID: chartName
                });
            }
        }
    }

    updateChartAxes(chart);
    chart.update();
}

function updateChartAxes(chart) {
    chart.options.scales = {}; // Очищаем текущие оси 
    let i = 0;
    for (const chartName in chartConfig) {
        if (shouldDrawChart(chartName)) {
            chart.options.scales[chartName] = createYAxis(chart, chartName, i);
            i++;
        }
    }
    chart.options.animation.duration = 0; // Отключаем анимацию для более быстрой обновляемости
    chart.update();
}


// Функция для проверки, следует ли рисовать график
function shouldDrawChart(chartName) {
    return chartConfig[chartName] && chartConfig[chartName].active === 1;
}

// Функция для создания осей Y на основе конфигурации
function createYAxis(chart, chartName, index) {
    const max = chartConfig[chartName].max || 500;
    return {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        max: max,
        ticks: {
            color: chartConfig[chartName].color,
        },
        title: {
            display: false,
            text: chartName,
            color: chartConfig[chartName].color,
        },
        grid: {
            display: false
        },
        id: chartName
    };
}

// Обработчик события "Старт"
function startChart() {
    if (!isChartRunning) {
        isChartRunning = true;

        // Делаем input и кнопку "Применить" неактивными
        const inputs = document.querySelectorAll('input');
        inputs.forEach(input => input.disabled = true);
        document.getElementById('apply').disabled = true;

        // Start the interval and store its ID
        updateInterval = setInterval(async () => {
            const currentTime = new Date().toLocaleTimeString();
            onlineChart.data.labels.push(currentTime);
            let shouldUpdateChart = false;
            for (const chartName in chartConfig) {
                if (shouldDrawChart(chartName)) {
                    shouldUpdateChart = true;
                    await updateChartWithModbusData(onlineChart, client);
                }
            }
            const messageElement = document.getElementById('message');
            messageElement.textContent = shouldUpdateChart 
                ? '' 
                : 'Выберите хотя бы один график в настройках.';
            onlineChart.update();
        }, 1000);
    }
}

// Обработчик события DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('online').getContext('2d');
    onlineChart = new Chart(ctx, { 
        type: 'line',
        data: {
            labels: time,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            elements: {
                point: {
                    radius: 0
                }
            },
            scales: {}
        },
        grid: {
            display: false
        }
    });

    // Disable the start button and stop button initially
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    startButton.disabled = true;
    stopButton.disabled = true; // Добавлено отключение кнопки "Стоп"

    // Add event listeners to input fields to check if they are filled
    const inputFields = ['client', 'bush', 'well', 'name_work'];
    inputFields.forEach(field => {
        document.getElementById(field).addEventListener('input', checkFields);
    });

    // Add event listener for the start button
    startButton.addEventListener('click', startChart);
});

// Функция для проверки, заполнены ли все необходимые поля
function checkFields() {
    const client = document.getElementById('client').value;
    const bush = document.getElementById('bush').value;
    const well = document.getElementById('well').value;
    const nameWork = document.getElementById('name_work').value;

    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton'); // Получаем элемент кнопки "Стоп"
    const messageElement = document.getElementById('message'); // Get the message element

    // Enable or disable the start button and stop button based on field values
    if (client && bush && well && nameWork) {
        startButton.disabled = false;
        stopButton.disabled = false; // Убираем disabled с кнопки "Стоп"
        messageElement.style.display = 'none'; // Hide the message if all fields are filled
    } else {
        startButton.disabled = true;
        stopButton.disabled = true; // Снова устанавливаем disabled на кнопку "Стоп"
        messageElement.textContent = 'Пожалуйста, заполните все поля перед началом.';
        messageElement.style.color = 'red';
        messageElement.style.display = 'inline'; // Show the message
    }
}

/*---------------------------------------------------------------------------------------*/

// Функция для преобразования данных в формат CSV
function convertInputsToCSV() {
    const client = document.getElementById('client').value;
    const bush = document.getElementById('bush').value;
    const well = document.getElementById('well').value;
    const nameWork = document.getElementById('name_work').value;

    // Проверяем, заполнены ли все поля
    if (!client || !bush || !well || !nameWork) {
        return null; // Возвращаем null, если поля не заполнены
    }

    // Получаем текущую дату в формате DD:MM:YY
    const currentDate = new Date();
    const day = String(currentDate.getDate()).padStart(2, '0');
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const year = String(currentDate.getFullYear()).slice(-2);
    const formattedDate = `${day}:${month}:${year}`;

    // Создаем массив строк CSV
    const csvData = [
        ['Client', 'Bush', 'Well', 'Work', 'Data'],
        [client, bush, well, nameWork, formattedDate]
    ];
    
    return csvData.map(row => row.join(',')).join('\n');
}

async function saveChartDataToCSV() {
    const csvData = convertInputsToCSV();
    
    if (!csvData) {
        const messageElement = document.getElementById('message');
        messageElement.textContent = 'Пожалуйста, заполните все поля перед началом.';
        messageElement.style.color = 'red';
        messageElement.style.display = 'inline';
        return;
    }

    try {
        const userSelectedPath = await ipcRenderer.invoke('show-save-dialog');
        if (userSelectedPath) {
            csvFilePath = userSelectedPath; // Инициализация переменной
        }

        // Сохраняем данные в csvFilePath
        ipcRenderer.send('save-csv', { filePath: csvFilePath, csvData });
        const messageElement = document.getElementById('message');
        messageElement.textContent = `Файл успешно создан: ${csvFilePath}`;
        messageElement.style.color = 'green';
        messageElement.style.display = 'inline';
    } catch (error) {
        const messageElement = document.getElementById('message');
        messageElement.textContent = `Ошибка: ${error.message}`;
        messageElement.style.color = 'red';
        messageElement.style.display = 'inline';
    }
}

// Объявление переменной для отслеживания времени
let currentTimeInSeconds = Math.floor(Date.now() / 1000); // Текущее время в секундах

async function updateChartWithModbusData(chart, client) {
    const dataMap = {
        'ДавЛевНас': await readModbusData(client, 500),
        'ДавПравНас': await readModbusData(client, 502),
        'ДавВыход': await readModbusData(client, 504),
        'РасходЛевНас': await readModbusData(client, 506),
        'РасходПравНас': await readModbusData(client, 508),
        'РасходВыход': await readModbusData(client, 510),
        'ТемпРецирк': await readModbusData(client, 512),
        'ДавРецирк': await readModbusData(client, 514),
        'ОбъемВыход': await readModbusData(client, 516),
        'РасходВоды': await readModbusData(client, 518),
        'Плотность': await readModbusData(client, 520),
    };

    // Log the retrieved Modbus data
    console.log('Retrieved Modbus Data:', dataMap);

    // Проверяем, что dataMap определен и содержит данные
    if (!dataMap || Object.values(dataMap).some(value => value === null)) {
        console.error('dataMap is undefined or contains null values, не могу записать данные в CSV');
        return; // Завершаем выполнение функции, если dataMap недоступен
    }

    // Получаем значения для client, bush, well и work
    const clientValue = document.getElementById('client').value;
    const bushValue = document.getElementById('bush').value;
    const wellValue = document.getElementById('well').value;
    const workValue = document.getElementById('name_work').value;

    // Записываем данные в CSV
    await writeDataToCSV(clientValue, bushValue, wellValue, workValue, dataMap);

    for (const chartName in dataMap) {
        if (shouldDrawChart(chartName)) {
            let dataset = chart.data.datasets.find(ds => ds.label === chartName);
            if (dataset) {
                dataset.data.push(dataMap[chartName]);
            } else {
                chart.data.datasets.push({
                    label: chartName,
                    data: [dataMap[chartName]],
                    backgroundColor: chartConfig[chartName].color,
                    borderColor: chartConfig[chartName].color,
                    fill: false,
                    yAxisID: chartName
                });
            }
        }
    }

    updateChartAxes(chart);
    chart.update();
}


/*---------------------------------------------------------------------------------*/

async function writeDataToCSV(client, bush, well, work, dataMap, isFirstRow) {
    try {
        const fileExists = fs.existsSync(csvFilePath);

        // Если файл не существует, создаем заголовок
        if (!fileExists) {
            const header = ['Client', 'Bush', 'Well', 'Work', 'Data', 
                'Time', 'ДавЛевНас', 'ДавПравНас', 'ДавВыход', 
                'РасходЛевНас', 'РасходПравНас', 'РасходВыход', 
                'ТемпРецирк', 'ДавРецирк', 'ОбъемВыход', 
                'РасходВоды', 'Плотность'];
            fs.writeFileSync(csvFilePath, header.join(',') + '\n');
        }

        const currentTime = new Date().toLocaleTimeString(); // Получаем только время
        const dataDate = isFirstRow ? new Date().toLocaleString() : ''; // Записываем дату только в первой строке

        // Формируем строку данных
        let row;
        if (isFirstRow) {
            // Если это первая строка, заполняем все данные
            row = [
                client || '',
                bush || '',
                well || '',
                work || '',
                dataDate, // Дата только для первой строки
                currentTime, // Время
                dataMap['ДавЛевНас'] || '',
                dataMap['ДавПравНас'] || '',
                dataMap['ДавВыход'] || '',
                dataMap['РасходЛевНас'] || '',
                dataMap['РасходПравНас'] || '',
                dataMap['РасходВыход'] || '',
                dataMap['ТемпРецирк'] || '',
                dataMap['ДавРецирк'] || '',
                dataMap['ОбъемВыход'] || '',
                dataMap['РасходВоды'] || '',
                dataMap['Плотность'] || ''
            ];
        } else {
            // Если это не первая строка, первые пять колонок пустые
            row = [
                '', '', '', '', '', // Пустые значения для первых пяти колонок
                '', // Дата пустая для последующих строк
                currentTime, // Время
                dataMap['ДавЛевНас'] || '',
                dataMap['ДавПравНас'] || '',
                dataMap['ДавВыход'] || '',
                dataMap['РасходЛевНас'] || '',
                dataMap['РасходПравНас'] || '',
                dataMap['РасходВыход'] || '',
                dataMap['ТемпРецирк'] || '',
                dataMap['ДавРецирк'] || '',
                dataMap['ОбъемВыход'] || '',
                dataMap['РасходВоды'] || '',
                dataMap['Плотность'] || ''
            ];
        }

        // Логируем строку перед записью
        console.log('Writing to CSV:', row);

        // Записываем строку в файл
        fs.appendFileSync(csvFilePath, row.join(',') + '\n');
        console.log('Data successfully written to CSV file.');
    } catch (error) {
        console.error('Error writing to CSV file:', error);
    }
}


/*------------------------------------------------------------------------------------*/

// Now define the updateChartWithModbusData function
async function updateChartWithModbusData(chart, client) {
    const dataMap = {
        'ДавЛевНас': await readModbusData(client, 500),
        'ДавПравНас': await readModbusData(client, 502),
        'ДавВыход': await readModbusData(client, 504),
        'РасходЛевНас': await readModbusData(client, 506),
        'РасходПравНас': await readModbusData(client, 508),
        'РасходВыход': await readModbusData(client, 510),
        'ТемпРецирк': await readModbusData(client, 512),
        'ДавРецирк': await readModbusData(client, 514),
        'ОбъемВыход': await readModbusData(client, 516),
        'РасходВоды': await readModbusData(client, 518),
        'Плотность': await readModbusData(client, 520),
    };

    // Логируем dataMap
    console.log('dataMap:', dataMap);

     // Check if dataMap is valid
    if (!dataMap || Object.values(dataMap).some(value => value === null || value === undefined)) {
        console.error('dataMap is undefined or contains null/undefined values, не могу записать данные в CSV');
        return; // Exit if dataMap is not valid
    }
    // Получаем значения для client, bush, well и work
    const clientValue = document.getElementById('client').value;
    const bushValue = document.getElementById('bush').value;
    const wellValue = document.getElementById('well').value;
    const workValue = document.getElementById('name_work').value;

    // Проверяем, что все значения для записи в CSV определены
    if (!clientValue || !bushValue || !wellValue || !workValue) {
        console.error('One or more input values are undefined or empty:', {
            client: clientValue,
            bush: bushValue,
            well: wellValue,
            work: workValue
        });
        return; // Прерываем выполнение, если одно из значений не определено
    }

    // Записываем данные в CSV
    await writeDataToCSV(clientValue, bushValue, wellValue, workValue, dataMap);

    // Обновляем график
    for (const chartName in dataMap) {
        if (shouldDrawChart(chartName)) {
            let dataset = chart.data.datasets.find(ds => ds.label === chartName);
            if (dataset) {
                dataset.data.push(dataMap[chartName]);
            } else {
                chart.data.datasets.push({
                    label: chartName,
                    data: [dataMap[chartName]],
                    backgroundColor: chartConfig[chartName].color,
                    borderColor: chartConfig[chartName].color,
                    fill: false,
                    yAxisID: chartName
                });
            }
        }
    }

    updateChartAxes(chart);
    chart.update();
}

/*---------------------------------------------------------------------------------*/

// Обработчик события "Стоп"
document.getElementById('stopButton').addEventListener('click', async () => {
    if (isChartRunning) {
        // Останавливаем обновление графика
        isChartRunning = false;

        // Очищаем интервал для остановки обновлений графика
        clearInterval(updateInterval);

        // Восстанавливаем активность input и кнопки "Применить"
        const inputs = document.querySelectorAll('input');
        inputs.forEach(input => input.disabled = false);
        document.getElementById('apply').disabled = false;

        // Создаем объект dataMap
        const dataMap = {};

        // Заполняем dataMap данными из графика
        onlineChart.data.datasets.forEach(dataset => {
            dataMap[dataset.label] = dataset.data; // Используем label как ключ и массив данных как значение
        });

        // Проверяем, что dataMap содержит данные
        if (Object.keys(dataMap).length === 0 || Object.values(dataMap).every(values => values.length === 0)) {
            console.log('Нет данных для записи в файл.');
            return;
        }

        // Записываем данные в CSV
        const clientValue = document.getElementById('client').value;
        const bushValue = document.getElementById('bush').value;
        const wellValue = document.getElementById('well').value;
        const workValue = document.getElementById('name_work').value;

        await writeDataToCSV(clientValue, bushValue, wellValue, workValue, dataMap);

        // Отображаем сообщение о сохранении данных на экране
        const messageElement = document.getElementById('message');
        messageElement.textContent = `Данные успешно сохранены в файл: ${csvFilePath}`;
        messageElement.style.color = 'green';
        messageElement.style.display = 'inline';
    }
});

/*---------------------------------------------------------------------------------------------*/

// Добавление обработчика события
document.getElementById('apply').addEventListener('click', saveChartDataToCSV);

// Обработчик для отображения сообщений
ipcRenderer.on('display-message', (event, message, filePath) => {
    const messageElement = document.getElementById('message');
    messageElement.textContent = `${message} ${filePath ? `(${filePath})` : ''}`;
    messageElement.style.color = 'green';
    messageElement.style.display = 'inline';
    messageElement.classList.remove('hide'); 
});