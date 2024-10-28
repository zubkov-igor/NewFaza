const {
    ipcRenderer
} = require('electron');
const chartjs = require('chart.js');
const fs = require('fs');
const path = require('path');

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

const annotationPlugin = require('chartjs-plugin-annotation');

let onlineChart;

const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load JSON configuration for charts
let chartConfig = {};
const configFilePath = path.join(__dirname, 'settings/settings.json');

try {
    const configData = fs.readFileSync(configFilePath, 'utf-8');
    chartConfig = JSON.parse(configData);
} catch (error) {
    console.error('Ошибка загрузки конфигурации графиков:', error);
}

// Функция для обновления цвета кнопки
function updateButtonColor(isConnected) {
    if (isConnected) {
        statusButton.style.backgroundColor = '#47CF73';
        statusButton.disabled = false;
    } else {
        statusButton.style.backgroundColor = 'tomato';
        statusButton.disabled = true;
    }
}

// Попытка подключения к устройству Modbus TCP
async function connectModbus() {
    try {
        await client.connectTCP("186.168.65.5", {
            port: 502
        });
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
        const data = await client.readHoldingRegisters(547, 1);
        console.log(data.data);
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

const time = [];
const datasets = [];

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
            display: true,
            text: chartName,
            color: chartConfig[chartName].color,
        }
    };
}


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

    // Обновление графика с данными Modbus 
    async function updateChartWithModbusData(chart, client) {
        const dataMap = {
            'P_left': {
                value: await readModbusData(client, 500)
            },
            'P_right': {
                value: await readModbusData(client, 502)
            },
            'P_pipe': {
                value: await readModbusData(client, 504)
            },
            'Q_left': {
                value: await readModbusData(client, 506)
            },
            'Q_right': {
                value: await readModbusData(client, 508)
            },
            'Q_pipe': {
                value: await readModbusData(client, 510)
            },
            'T_rec': {
                value: await readModbusData(client, 512)
            },
            'P_rec': {
                value: await readModbusData(client, 514)
            },
            'V_pipe': {
                value: await readModbusData(client, 516)
            },
            'Qw': {
                value: await readModbusData(client, 518)
            },
            'Plm': {
                value: await readModbusData(client, 520)
            },
        };

        for (const chartName in dataMap) {
            if (shouldDrawChart(chartName)) {
                let dataset = chart.data.datasets.find(ds => ds.label === chartName);
                if (dataset) {
                    dataset.data.push(dataMap[chartName].value);
                } else {
                    chart.data.datasets.push({
                        label: chartName,
                        data: [dataMap[chartName].value],
                        backgroundColor: chartConfig[chartName].color,
                        borderColor: chartConfig[chartName].color,
                        fill: false
                    });
                }
            }
        }

        updateChartAxes(chart); // Обновляем оси перед обновлением графика 
        chart.update();
    }

    // Функция для проверки, следует ли рисовать график
    function shouldDrawChart(chartName) {
        return chartConfig[chartName] && chartConfig[chartName].active === 1;
    }

    // Основной цикл обновления графика 
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
        if (!shouldUpdateChart) {
            messageElement.textContent = 'Выберите хотя бы один график в настройках.';
        } else {
            messageElement.textContent = '';
        }

        onlineChart.update();
    }, 1000);
});

const statusButton = document.getElementById('statusButton');
const saveButton = document.getElementById('saveCsvButton');

// Функция для преобразования данных в формат CSV
function convertToCSV(data) {
    const headers = ['Time', ...data.map(dataset => dataset.label)];
    const rows = onlineChart.data.labels.map((t, index) => {
        const row = [t];
        data.forEach(dataset => {
            row.push(dataset.data[index] || '');
        });
        return row.join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}

async function saveChartDataToCSV() {
    const csvData = convertToCSV(onlineChart.data.datasets);
    const filePath = await ipcRenderer.invoke('show-save-dialog');

    if (filePath) {
        ipcRenderer.send('save-csv', {
            filePath,
            csvData
        });
    } else {
        displayMessage('Файл не сохранен');
    }
}

ipcRenderer.on('display-message', (event, message, filePath) => {
    const messageElement = document.getElementById('message');
    messageElement.textContent = `${message} ${filePath ? `${filePath})` : ''}`;
    messageElement.style.display = 'inline';
    messageElement.classList.remove('hide'); 
    setTimeout(() => {
        messageElement.classList.add('hide'); // Добавляем класс hide для анимации
        setTimeout(() => {
            messageElement.style.display = 'none'; // Скрываем сообщение после анимации
        }, 500); // 500 миллисекунд — время анимации
    }, 60000); // 60 000 миллисекунд = 1 минута
});


// Привязка функции к кнопке
document.getElementById('saveCsvButton').addEventListener('click', saveChartDataToCSV);
