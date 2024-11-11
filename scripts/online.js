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
        'P_left': await readModbusData(client, 500),
        'P_right': await readModbusData(client, 502),
        'P_pipe': await readModbusData(client, 504),
        'Q_left': await readModbusData(client, 506),
        'Q_right': await readModbusData(client, 508),
        'Q_pipe': await readModbusData(client, 510),
        'T_rec': await readModbusData(client, 512),
        'P_rec': await readModbusData(client, 514),
        'V_pipe': await readModbusData(client, 516),
        'Qw': await readModbusData(client, 518),
        'Plm': await readModbusData(client, 520),
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
// Функция для старта обновления графика
function startChart() {
    if (!isChartRunning) {
        isChartRunning = true;
        setInterval(async () => {
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
                    radius: 1
                }
            },
            scales: {}
        }
    });
    // Привязка функции к кнопке
    document.getElementById('startButton').addEventListener('click', startChart);
});
// Функция для преобразования данных в формат CSV

function convertToCSV() {
    // Проверяем, существуют ли данные
    if (!onlineChart || !onlineChart.data || !onlineChart.data.labels || !onlineChart.data.datasets) {
        throw new Error('Данные для преобразования в CSV отсутствуют');
    }
    // Определяем заголовки CSV
    const headers = ['Client', 'bush', 'well', 'name_work'];
    // Создаем строки для данных
    const rows = onlineChart.data.labels.map((label, index) => {
        const row = [];
        // Извлекаем данные по каждому заголовку
        headers.forEach(header => {
            const dataset = onlineChart.data.datasets.find(ds => ds.label === header);
            row.push(dataset ? dataset.data[index] || '' : ''); // Добавляем значение или пустую строку
        });
        return row.join(','); // Преобразуем строку в формат CSV
    });
    // Объединяем заголовки и строки в одну строку CSV
    return [headers.join(','), ...rows].join('\n');
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
    const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Месяцы начинаются с 0
    const year = String(currentDate.getFullYear()).slice(-2); // Берем последние 2 цифры года
    const formattedDate = `${day}:${month}:${year}`; // Форматируем дату

    // Создаем массив строк CSV
    const csvData = [
        ['Заказчик', 'Куст', 'Скважина', 'Название работы', 'Дата'], // Добавляем заголовок для даты
        [client, bush, well, nameWork, formattedDate] // Добавляем данные с текущей датой
    ];
    
    // Преобразуем массив в строку CSV
    return csvData.map(row => row.join(',')).join('\n');
}

// Объявление функции
async function saveChartDataToCSV() {
    const csvData = convertInputsToCSV(); // Получаем данные CSV или null, если есть ошибка
    
    // Проверяем, есть ли сообщение об ошибке
    if (!csvData) {
        const messageElement = document.getElementById('message');
        messageElement.textContent = 'Не все поля заполнены, файл не создан.'; // Выводим сообщение об ошибке
        messageElement.style.color = 'red';
        messageElement.style.display = 'inline';
        return; // Выходим из функции, если есть ошибка
    }

    try {
        const filePath = await ipcRenderer.invoke('show-save-dialog'); // Открываем диалог для сохранения файла
        
        if (filePath) {
            ipcRenderer.send('save-csv', { filePath, csvData }); // Отправляем данные для сохранения
            const messageElement = document.getElementById('message');
            messageElement.textContent = `Файл успешно создан: ${filePath}`; // Сообщение об успешном сохранении
            messageElement.style.color = 'green';
            messageElement.style.display = 'inline';
        } else {
            const messageElement = document.getElementById('message');
            messageElement.textContent = 'Не удалось сохранить файл.'; // Сообщение, если файл не был сохранен
            messageElement.style.color = 'red';
            messageElement.style.display = 'inline';
        }
    } catch (error) {
        const messageElement = document.getElementById('message');
        messageElement.textContent = `Ошибка: ${error.message}`; // Выводим сообщение об ошибке
        messageElement.style.color = 'red'; // Устанавливаем цвет текста в красный
        messageElement.style.display = 'inline'; // Делаем элемент видимым
    }
}

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
// Привязка функции к кнопке сохранения
document.getElementById('saveCsvButton').addEventListener('click', saveChartDataToCSV);