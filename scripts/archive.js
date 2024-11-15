const {
    ipcRenderer
} = require('electron');
const {
    Readable
} = require('stream');
const chartjs = require('chart.js');
const fastcsv = require('fast-csv');
const {
    Chart,
    LinearScale,
    LineController,
    CategoryScale,
    PointElement,
    LineElement,
    Legend,
    Tooltip,
} = chartjs;

const annotationPlugin = require('chartjs-plugin-annotation');
const dragDataPlugin = require('chartjs-plugin-dragdata');
const ChartZoom = require('chartjs-plugin-zoom');

Chart.register([LinearScale, LineController, CategoryScale, PointElement, LineElement, Legend, Tooltip, ChartZoom]);

let archiveChart;
let selectedPoints = [];
const activePoints = new Set();
let currentChartId = null;

function handleOpenCsvClick() {
    ipcRenderer.send('open-file-dialog');
}

document.getElementById('csvFile').addEventListener('click', handleOpenCsvClick);
ipcRenderer.on('selected-file', handleSelectedFile);
document.getElementById('save').addEventListener('click', saveChartAsPNG);


// Функция для сохранения графика как PNG
function saveChartAsPNG() {
    const chart = archiveChart;
    const canvas = chart.canvas;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0);
    const dataURL = tempCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'chart.png';
    a.click();
}

// Обработчик клика для обновления значений точек
document.getElementById('updateValues').addEventListener('click', () => {
    const newValue1 = parseFloat(document.getElementById('value1').value);
    const newValue2 = parseFloat(document.getElementById('value2').value);

    // Проверка на количество выбранных точек
    if (selectedPoints.length !== 2) {
        alert("Выберите 2 точки для обновления значений.");
        return; // Выход из функции, если выбрано не 2 точки
    }

    // Проверка на корректность вводимых значений
    if (isNaN(newValue1) || isNaN(newValue2) || newValue1 < 0 || newValue2 < 0) {
        alert("Пожалуйста, введите корректные положительные числовые значения для обеих точек.");
        // Не выходим из функции, чтобы разрешить ввод новых значений
        return;
    }

    const startIndex = Math.min(selectedPoints[0], selectedPoints[1]);
    const endIndex = Math.max(selectedPoints[0], selectedPoints[1]);

    // Удаляем промежуточные точки на всех графиках
    archiveChart.data.datasets.forEach((dataset) => {
        dataset.data.splice(startIndex + 1, endIndex - startIndex - 1);
        // Обновляем значения выбранных точек
        dataset.data[startIndex] = newValue1; // Присваиваем новое значение
        dataset.data[startIndex + 1] = newValue2; // Присваиваем новое значение
    });

    // Сбросить выбранные точки
    selectedPoints = [];
    activePoints.clear(); // Очищаем активные точки
    document.getElementById('updateValues').disabled = true; // Отключаем кнопку обновления

    // Обновляем график
    archiveChart.update();

    // Сброс состояния активных точек
    updatePointStyles(); // Обновляем стили точек

    // Очищаем поля ввода
    document.getElementById('value1').value = '';
    document.getElementById('value2').value = '';

    // Разрешаем повторный выбор точек
    enablePointSelection();
});

// Функция для включения выбора точек
function enablePointSelection() {
    // Удаляем старый обработчик, если он существует
    const archiveElement = document.getElementById('archive');
    const oldHandler = pointSelectionHandler;
    archiveElement.removeEventListener('click', oldHandler); // Удаляем предыдущий обработчик

    // Добавляем новый обработчик для выбора точек
    archiveElement.addEventListener('click', pointSelectionHandler);
}


// Обработчик клика для выделения интервала
function pointSelectionHandler(event) {
    const points = archiveChart.getElementsAtEventForMode(event, 'nearest', {
        intersect: true
    }, true);

    if (points.length) {
        const index = points[0].index;

        // Получаем значение времени по оси X
        const timeValue = archiveChart.data.labels[index];

        // Обновляем сообщение с временем
        const messageElement = document.getElementById('message');
        messageElement.innerText = `Выбрано время: ${timeValue}`;

        // Проверьте, включена ли точка
        if (activePoints.has(index)) {
            activePoints.delete(index); // Отменить выделение пункта
        } else {
            // Если выбраны менее 2 точек, добавить новую точку
            if (activePoints.size < 2) {
                activePoints.add(index); // Select the point
            } else {
                // Replace alert with dialog
                ipcRenderer.send('show-alert', "Вы можете выбрать только 2 точки."); // Show dialog
                // Reset selection
                activePoints.clear(); // Clear active points
                selectedPoints = []; // Reset selected points
                document.getElementById('updateValues').disabled = true; // Disable update button
                // Continue execution
            }
        }

        selectedPoints = Array.from(activePoints);
        document.getElementById('updateValues').disabled = selectedPoints.length !== 2;

        // Update chart to reflect changes
        updatePointStyles();
    }
}

// Функция для обновления стилей точек
function updatePointStyles() {
    // Обновляем данные графика для изменения цвета точек
    archiveChart.data.datasets.forEach((dataset) => {
        dataset.pointBackgroundColor = dataset.data.map((_, index) => {
            return selectedPoints.includes(index) ? 'rgba(255,0,0,1)' : dataset.borderColor;
        });
    });

    // Обновляем график
    archiveChart.update();

    // Отображаем сообщение о выбранных точках
    const messageElement = document.getElementById('message');
    if (selectedPoints.length === 2) {
        // Получаем значения времени по выбранным точкам
        const timeValues = selectedPoints.map(index => archiveChart.data.labels[index]);

        messageElement.innerText = `Выбран интервал: ${timeValues[0]} - ${timeValues[1]}`;
    } else {
        messageElement.innerText = '';
    }
}

/*---------------------------------------------------------------------------*/

// Инициализация элемента для отображения сообщения
const messageElement = document.createElement('div');
messageElement.id = 'message';
document.body.appendChild(messageElement);

let clientInfo = "";
let headers = ["Client", "Bush", "Well", "Work", "Data"]; 
let clientDataExtracted = false; // Флаг для отслеживания, были ли извлечены данные о клиенте

const clientInfoPlugin = {
    id: 'clientInfoPlugin',
    beforeDraw: function(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '12px Arial';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const x = chart.width - 10;
        let y = 30;
        if (clientInfo) {
            const clientInfoArray = clientInfo.split('. ');
            const clientInfoWithValues = clientInfoArray.join(', '); // Объединяем в строку

            ctx.fillText(clientInfoWithValues, x, y);
        } else {
            ctx.fillText("Нет данных о клиенте", x, y);
        }

        ctx.restore();
    }
};

// Регистрация плагина
Chart.register(clientInfoPlugin);

function handleSelectedFile(event, path) {
    const filePathElement = document.getElementById('file-path');
    filePathElement.innerText = `файл: ${path}`;

    if (archiveChart) {
        archiveChart.destroy();
        archiveChart = null;
    }

    const formattedData = [];
    const chartLabels = new Set(); // Объявляем chartLabels здесь

    fetch(path)
        .then(response => {
            if (!response.ok) {
                throw new Error('The online response was not correct');
            }
            return response.text();
        })
        .then(data => {
            const utf8BOM = '\uFEFF';
            if (data.startsWith(utf8BOM)) {
                data = data.slice(1);
            }

            const stream = Readable.from([data]);
            stream
                .pipe(fastcsv.parse({
                    headers: true
                }))
                .on('data', (row) => {
                    if (!clientDataExtracted) {
                        // Извлекаем данные для clientInfo из первой строки
                        clientInfo = `Заказчик: ${row['Client']}. Куст: ${row['Bush']}. Скважина: ${row['Well']}. Работа: ${row['Work']}. Дата: ${row['Data']}`;
                        clientDataExtracted = true; // Устанавливаем флаг, что данные о клиенте извлечены
                    } else if (row.Time) { // Проверяем, есть ли значение Time
                        formattedData.push({
                            Time: row.Time,
                            P_left: row.ДавЛевНас ? parseFloat(row.ДавЛевНас) : null,
                            P_right: row.ДавПравНас ? parseFloat(row.ДавПравНас) : null,
                            P_pipe: row.ДавВыход ? parseFloat(row.ДавВыход) : null,
                            Q_left: row.РасЛевНас ? parseFloat(row.РасЛевНас) : null,
                            Q_right: row.РасПравНас ? parseFloat(row.РасПравНас) : null,
                            Q_pipe: row.РасВыход ? parseFloat(row.РасВыход) : null,
                            T_rec: row.ТемпРец ? parseFloat(row.ТемпРец) : null,
                            P_rec: row.ПлотРец ? parseFloat(row.ПлотРец) : null,
                            V_pipe: row.ОбъемВых ? parseFloat(row.ОбъемВых) : null,
                            Qw: row.РасВоды ? parseFloat(row.РасВоды) : null,
                            Plm: row.Плотность ? parseFloat(row.Плотность) : null
                        });

                        // Добавляем заголовки графиков в Set, пропуская первые 6 заголовков
                        const headersToSkip = ['Client', 'Bush', 'Well', 'Work', 'Data', 'Time'];
                        Object.keys(row).forEach(key => {
                            if (!headersToSkip.includes(key) && row[key] !== undefined && row[key] !== null) {
                                chartLabels.add(key);
                            }
                        });
                    }
                })
                .on('error', error => {
                    console.error('Error parsing CSV:', error);
                })
                .on('end', () => {
                    const time = formattedData.map(row => {
                        const parsedTime = Date.parse(`1970-01-01T${row.Time}`);
                        return isNaN(parsedTime) ? null : new Date(parsedTime).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        });
                    });

                    // Заполнение <select> заголовками графиков
                    const chartSelect = document.getElementById('chartSelect');
                    chartSelect.innerHTML = ''; // Очищаем предыдущие значения
                    chartLabels.forEach(label => {
                        const option = document.createElement('option');
                        option.value = label;
                        option.textContent = label;
                        chartSelect.appendChild(option);
                    });

                    const datasets = [];
                    const addDataset = (label, dataKey, color, yAxisID) => {
                        if (formattedData.some(row => row[dataKey] !== undefined && row[dataKey] !== null)) {
                            datasets.push({
                                label: label,
                                data: formattedData.map(row => parseFloat(row[dataKey])),
                                backgroundColor: formattedData.map(() => color),
                                borderColor: color,
                                borderWidth: 1,
                                cubicInterpolationMode: 'monotone',
                                yAxisID: yAxisID,
                                color: color
                            });
                        }
                    };

                    addDataset('ДавЛевНас', 'P_left', 'rgba(153,0,2,1)', 'P_left');
                    addDataset('ДавПравНас', 'P_right', 'rgba(255,127,126,1)', 'P_right');
                    addDataset('ДавВыход', 'P_pipe', 'rgba(254,0,0,1)', 'P_pipe');
                    addDataset('РасЛевНас', 'Q_left', 'rgba(51,153,254,1)', 'Q_left');
                    addDataset('РасПравНас', 'Q_right', 'rgba(152,204,254,1)', 'Q_right');
                    addDataset('РасВыход', 'Q_pipe', 'rgba(0,0,255,1)', 'Q_pipe');
                    addDataset('ТемпРец', 'T_rec', 'rgba(254,215,0,1)', 'T_rec');
                    addDataset('ПлотРец', 'P_rec', 'rgba(127,204,126,1)', 'P_rec');
                    addDataset('ОбъемВых', 'V_pipe', 'rgba(0,0,0,1)', 'V_pipe');
                    addDataset('РасВоды', 'Qw', 'rgba(255,102,0,1)', 'Qw');
                    addDataset('Плотность', 'Plm', 'rgba(0,153,0,1)', 'Plm');

                    const scales = {};
                    datasets.forEach(dataset => {
                        if (dataset.yAxisID) {
                            scales[dataset.yAxisID] = {
                                display: true,
                                ticks: {
                                    display: true,
                                    position: 'left',
                                    color: dataset.color
                                },
                                title: {
                                    display: false,
                                    position: 'left',
                                    text: dataset.label,
                                    color: dataset.color, 
                                    font: {
                                        size: 12,
                                        weight: 'normal'
                                    }
                                },
                                grid: {
                                    color: dataset.color,
                                    lineWidth: 0
                                },
                                font: {
                                    size: 12
                                },
                            };
                        }
                    });

                    // Создание графика после обработки данных
                    archiveChart = new Chart(document.getElementById('archive').getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: time,
                            datasets: datasets.map(dataset => ({
                            ...dataset,
                                dragData: true, 
                                dragX: true,   
                                dragY: true
                            }))
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: {
                                clientInfoPlugin: {},
                                legend: {
                                    display: true,
                                    align: 'start'
                                },
                                tooltip: {
                                    enabled: true,
                                    callbacks: {
                                        label: function(tooltipItem) {
                                            return 'Value: ' + tooltipItem.raw + ' (' + tooltipItem.dataset.label + ')';
                                        }
                                    }
                                },
                                zoom: {
                                    pan: {
                                        enabled: true,
                                        mode: 'x',
                                        modifierKey: 'alt',
                                    },
                                    zoom: {
                                        wheel: {
                                            enabled: true,
                                            modifierKey: 'ctrl',
                                        },
                                        pinch: {
                                            enabled: true
                                        },
                                        mode: 'x',
                                    }
                                }
                            },
                            dragData: {
                                round: 2,
                                showTooltip: false,
                                onDragStart: function(event, datasetIndex,index, value){
                                },
                                onDrag: function(event, datasetIndex, index, value) { 
                                },
                                onDragEnd: function(event, datasetIndex, index, value) {
                                    datasets[datasetIndex].data[index] = value;
                                    archiveChart.update();
                                }
                            },
                            animation: {
                                duration: 1000,
                            },
                            hover: {
                                animationDuration: 500,
                            },
                            layout: {
                                padding: {
                                    left: 0,
                                    right: 0,
                                    top: 0,
                                    bottom: 0
                                }
                            },
                            scales: scales,
                            elements: {
                                point: {
                                    radius: 1
                                }
                            },
                            annotation: {
                                annotations: []
                            }
                        },
                        plugins: [annotationPlugin, dragDataPlugin]
                    });


                    // Функция для включения выбора точек на графике
                    function enablePointSelection() {
                        const canvas = document.getElementById('archive');
                        canvas.addEventListener('click', pointSelectionHandler);
                    }

                    // Инициализация выбора точек после загрузки графика
                    function init() {
                        document.getElementById('chartSelect').dispatchEvent(new Event('change'));
                    }

                    // Запуск инициализации
                    init();

                    // Обработчик события для закрытия окна приложения
                    window.addEventListener('beforeunload', () => {
                        if (archiveChart) {
                            archiveChart.destroy();
                            archiveChart = null;
                        }
                    });
                });
        });
}