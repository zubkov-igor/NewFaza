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
        return buf.readFloatLE(0);
    } catch (error) {
        console.error('Ошибка чтения данных Modbus:', error);
        return null;
    }
}

// Функция для обновления графика с данными Modbus 
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
                    fill: false
                });
            }
        }
    }
    updateChartAxes(chart);
    chart.update();
}

// Функция для проверки, следует ли рисовать график
function shouldDrawChart(chartName) {
    return chartConfig[chartName] && chartConfig[chartName].active === 1;
}

// Функция для создания осей Y на основе конфигурации
function createYAxis(chart, chartName) {
    const max = chartConfig[chartName].max || 100;
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
        }
    };
}

// Обновление осей Y на основе активных графиков
function updateChartAxes(chart) {
    chart.options.scales = {}; // Очищаем текущие оси 
    for (const chartName in chartConfig) {
        if (shouldDrawChart(chartName)) {
            chart.options.scales[chartName] = createYAxis(chart, chartName);
        }
    }
    chart.update();
}

let updateInterval;

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

// Объявление функции
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
            csvFilePath = userSelectedPath;
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

// Функция для записи данных в CSV
async function writeDataToCSV(dataMap) {
    try {
        if (!csvFilePath) {
            throw new Error('Путь к файлу не установлен.');
        }

        // Получаем текущее время
        const currentTime = new Date().toLocaleTimeString();

        // Формируем строки данных
        const csvData = Object.values(dataMap).map(value => {
            return `,,,,,${currentTime},${value}`; // Пять пустых колонок, текущее время и значение
        }).join('\n');

        // Записываем только данные в файл
        fs.appendFileSync(csvFilePath, csvData + '\n', { encoding: 'utf8' });
    } catch (error) {
        console.error('Ошибка при записи в файл:', error);
    }
}

// Обработчик события "Стоп"
document.getElementById('stopButton').addEventListener('click', async () => {
    if (isChartRunning) {
        // Останавливаем обновление графика
        isChartRunning = false;

        // Clear the interval to stop chart updates
        clearInterval(updateInterval);

        // Восстанавливаем активность input и кнопки "Применить"
        const inputs = document.querySelectorAll('input');
        inputs.forEach(input => input.disabled = false);
        document.getElementById('apply').disabled = false;

        // Записываем данные в заранее указанный CSV-файл
        const dataToWrite = onlineChart.data.labels.map((label, index) => {
            const row = [label];
            onlineChart.data.datasets.forEach(dataset => {
                row.push(dataset.data[index] !== undefined ? dataset.data[index] : '');
            });
            return row.join(',');
        }).join('\n');

        if (dataToWrite.trim() === '') {
            console.log('Нет данных для записи в файл.');
            return;
        }

        await writeDataToCSV(dataToWrite);

        // Отображаем сообщение о сохранении данных на экране
        const messageElement = document.getElementById('message');
        messageElement.textContent = `Данные успешно сохранены в файл: ${csvFilePath}`;
        messageElement.style.color = 'green';
        messageElement.style.display = 'inline';
    }
});

// Добавление обработчика события
document.getElementById('apply').addEventListener('click', saveChartDataToCSV);

// Обработчик для отображения сообщений
ipcRenderer.on('display-message', (event, message, filePath) => {
    const messageElement = document.getElementById('message');
    messageElement.textContent = `${message} ${filePath ? `(${filePath})` : ''}`;
    messageElement.style.color = 'green';
    messageElement.style.display = 'inline';
    messageElement.classList.remove('hide'); 
    setTimeout(() => {
        messageElement.classList.add('hide');
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 500);
    }, 60000);
});
