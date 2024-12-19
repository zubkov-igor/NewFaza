const {
    ipcRenderer
} = require('electron');
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
const timestamps = []; // Массив для хранения временных меток
const datasets = [];
let isChartRunning = false; // Флаг для отслеживания состояния графика
const statusButton = document.getElementById('statusButton');
let csvFilePath = ''; // Переменная для хранения пути к CSV-файлу
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
    statusButton.style.background = isConnected ?
        'radial-gradient(farthest-side at top left, #47CF73, #aceac0)' :
        'radial-gradient(farthest-side at top left, #ff6347, #ffa494)';
    statusButton.disabled = !isConnected;
}

// Функция для ожидания
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для подключения к устройству Modbus
async function connectModbus() {
    try {
        // await client.connectTCP("192.168.68.5", { port: 502 });
        await client.connectTCP("localhost", { port: 502 });
        client.setID(1);
        console.log('Подключение к Modbus успешно');
        updateButtonColor(true);
    } catch (error) {
        console.error('Ошибка подключения:', error.message);
        updateButtonColor(false);
        await sleep(1000); // Ждем перед повторной попыткой
        connectModbus(); // Повторная попытка подключения
    }
}

// Функция для проверки соединения
async function checkConnection() {
    try {
        await client.readHoldingRegisters(547, 1);
        console.log('Соединение активно');
        updateButtonColor(true);
    } catch (error) {
        console.error('Проблема с соединением:', error.message);
        updateButtonColor(false);
        await sleep(1000);
        await client.close(); // Закрываем клиент
        connectModbus(); // Повторная попытка подключения
    }
}

// Инициируем подключение и проверку соединения
async function startModbus() {
    await connectModbus(); // Первоначальное подключение
    setInterval(checkConnection, 5000); // Проверяем соединение каждые 5 секунд
}

// Запускаем процесс
startModbus();

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
        'ПлотРецирк': await readModbusData(client, 514),
        'ОбъемВыход': await readModbusData(client, 516),
        'РасходВоды': await readModbusData(client, 518),
        'Плотность': await readModbusData(client, 520),
    };

    // Получаем текущую временную метку
    const currentTime = new Date().toLocaleTimeString();
    timestamps.push(currentTime); // Добавляем временную метку без проверки

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
                    borderWidth: 1,
                    tension: 0.4,
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
    chart.options.animation.duration = 0;
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
            messageElement.textContent = shouldUpdateChart ?
                '' :
                'Выберите хотя бы один график в настройках.';
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
            animation: {
                duration: 1000,
                easing: 'easeOutBounce'
            },
            elements: {
                point: {
                    radius: 0
                }
            },
            scales: {
                x: {
                    max: 10
                }
            }
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

    // Создаем массив строк CSV
    const csvData = [
        ['Client', 'Bush', 'Well', 'Work', 'Data', 'Time'],
        [client, bush, well, nameWork, new Date().toLocaleDateString(), new Date().toLocaleTimeString()]
    ];

    return csvData.map(row => row.join(',')).join('\n');
}

// Функция для создания CSV файла и записи данных о клиенте
async function createCSVFile() {
    const csvData = convertInputsToCSV();

    if (!csvData) {
        const messageElement = document.getElementById('message');
        messageElement.textContent = 'Пожалуйста, заполните все поля перед созданием файла.';
        messageElement.style.color = 'red';
        messageElement.style.display = 'inline';
        return;
    }

    try {
        const userSelectedPath = await ipcRenderer.invoke('show-save-dialog');
        if (userSelectedPath) {
            csvFilePath = userSelectedPath; // Инициализация переменной
            fs.writeFileSync(csvFilePath, csvData + '\n', {
                flag: 'w'
            }); // Создаем файл и записываем данные о клиенте
            const messageElement = document.getElementById('message');
            messageElement.textContent = `Файл успешно создан: ${csvFilePath}`;
            messageElement.style.color = 'green';
            messageElement.style.display = 'inline';
        }
    } catch (error) {
        const messageElement = document.getElementById('message');
        messageElement.textContent = `Ошибка: ${error.message}`;
        messageElement.style.color = 'red';
        messageElement.style.display = 'inline';
    }
}

// Обработчик события "Применить"
document.getElementById('apply').addEventListener('click', createCSVFile);

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

        // Получаем значения для client, bush, well и work
        const clientValue = document.getElementById('client').value;
        const bushValue = document.getElementById('bush').value;
        const wellValue = document.getElementById('well').value;
        const workValue = document.getElementById('name_work').value;

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
        await writeDataToCSV(clientValue, bushValue, wellValue, workValue, new Date().toLocaleDateString(), dataMap);

        // Отображаем сообщение о сохранении данных на экране
        const messageElement = document.getElementById('message');
        messageElement.textContent = `Данные успешно сохранены в файл: ${csvFilePath}`;
        messageElement.style.color = 'green';
        messageElement.style.display = 'block';
    }
});

// Функция записи данных в CSV
let headersWritten = false; // Флаг для отслеживания, были ли записаны заголовки

async function writeDataToCSV(client, bush, well, work, date, dataMap) {
    if (!dataMap) {
        console.error('Ошибка: dataMap является undefined');
        return; // Прерываем выполнение функции
    }

    try {
        const fileExists = fs.existsSync(csvFilePath);

        // Получаем динамические заголовки из dataMap
        const headers = ['Client', 'Bush', 'Well', 'Work', 'Date', 'Time'];
        const chartNames = Object.keys(dataMap);

        // Добавляем названия графиков в заголовки
        headers.push(...chartNames);

        // Записываем заголовки только один раз
        if (!headersWritten) {
            fs.writeFileSync(csvFilePath, headers.join(',') + '\n');
            headersWritten = true; // Устанавливаем флаг, что заголовки записаны
        }

        // Записываем данные
        const maxLength = Math.max(...Object.values(dataMap).map(arr => arr.length)); // Максимальная длина массивов

        const uniqueRows = new Set(); // Используем Set для хранения уникальных строк

        // Начальная временная метка
        let currentTime = new Date(); // Получаем текущее время
        currentTime.setSeconds(currentTime.getSeconds() - maxLength); // Устанавливаем начальное время на maxLength секунд назад

        for (let i = 0; i < maxLength; i++) {
            const rowTime = currentTime.toLocaleTimeString(); // Получаем временную метку для текущей строки
            const row = [
                i === 0 ? client : '', // Записываем значение Client только для первой строки
                i === 0 ? bush : '', // Записываем значение Bush только для первой строки
                i === 0 ? well : '', // Записываем значение Well только для первой строки
                i === 0 ? work : '', // Записываем значение Work только для первой строки
                i === 0 ? date : '', // Записываем значение Date только для первой строки
                rowTime // Используем временную метку для текущей строки
            ];

            // Добавляем данные графиков
            for (const chartName of chartNames) {
                const value = dataMap[chartName][i] !== undefined ? dataMap[chartName][i] : ''; // Если значение существует, добавляем его
                row.push(value);
            }

            // Преобразуем строку в формат для проверки уникальности
            const rowString = row.join(',');

            // Проверяем, существует ли такая строка
            if (!uniqueRows.has(rowString)) {
                uniqueRows.add(rowString); // Добавляем строку в Set
                fs.appendFileSync(csvFilePath, row.join(',') + '\n'); // Записываем строку в файл
            }

            // Увеличиваем временную метку на 1 секунду для следующей строки
            currentTime.setSeconds(currentTime.getSeconds() + 1);
        }

        console.log('Данные успешно записаны в CSV файл.');
    } catch (error) {
        console.error('Ошибка записи в CSV файл:', error);
        console.error('Проверка dataMap:', dataMap);
    }
}

// Обработчик события для отображения сообщений
ipcRenderer.on('display-message', (event, message, filePath) => {
    const messageElement = document.getElementById('message');
    messageElement.textContent = `${message} ${filePath ? `(${filePath})` : ''}`;
    messageElement.style.color = 'green';
    messageElement.style.display = 'inline';
    messageElement.classList.remove('hide');
});