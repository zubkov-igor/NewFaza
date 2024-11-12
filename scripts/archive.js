const {
    ipcRenderer
} = require('electron');
const { Readable } = require('stream');
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
        return; // Не выходим из функции, чтобы разрешить ввод новых значений
    }

    const startIndex = Math.min(selectedPoints[0], selectedPoints[1]);
    const endIndex = Math.max(selectedPoints[0], selectedPoints[1]);

    // Удаляем промежуточные точки на выбранном графике
    const datasetIndex = document.getElementById('chartSelect').selectedIndex;
    if (datasetIndex >= 0 && archiveChart) {
        const dataset = archiveChart.data.datasets[datasetIndex];

        // Обновляем значения Y для выбранных точек
        dataset.data[startIndex] = newValue1; // Присваиваем новое значение для первой точки
        dataset.data[endIndex] = newValue2; // Присваиваем новое значение для второй точки

        // Удаляем промежуточные точки
        dataset.data.splice(startIndex + 1, endIndex - startIndex - 1); // Удаляем промежуточные точки между startIndex и endIndex

        // Обновляем график
        archiveChart.update();
    }

    // Сбросить выбранные точки
    selectedPoints = [];
    activePoints.clear();
    document.getElementById('updateValues').disabled = true;

    // Очищаем поля ввода
    document.getElementById('value1').value = '';
    document.getElementById('value2').value = '';

    // Разрешаем повторный выбор точек
    enablePointSelection();
});

// Обработчик клика для выделения интервала
function pointSelectionHandler(event) {
    const datasetIndex = document.getElementById('chartSelect').selectedIndex;
    if (datasetIndex < 0 || !archiveChart) {
        return; // Если график не выбран, ничего не делаем
    }

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

        // Проверяем, включена ли точка
        if (activePoints.has(index)) {
            activePoints.delete(index); // Отменить выделение пункта
        } else {
            // Если выбраны менее 2 точек, добавить новую точку
            if (activePoints.size < 2) {
                activePoints.add(index); // Выбрать точку
            } else {
                // Если уже выбрано 2 точки, показываем предупреждение
                ipcRenderer.send('show-alert', "Вы можете выбрать только 2 точки.");
                // Сброс выделения
                activePoints.clear(); // Очистить активные точки
                selectedPoints = []; // Сбросить выбранные точки
                document.getElementById('updateValues').disabled = true; // Отключить кнопку обновления
            }
        }

        selectedPoints = Array.from(activePoints);
        document.getElementById('updateValues').disabled = selectedPoints.length !== 2;

        // Обновляем график, чтобы отразить изменения
        updatePointStyles();
    }
}

// Функция для обновления стилей точек
function updatePointStyles() {
    if (!currentChartId) return; // Если график не выбран, ничего не делаем

    archiveChart.data.datasets.forEach((dataset, datasetIndex) => {
        if (dataset.label === currentChartId) { // Проверяем, является ли текущий набор данных выбранным графиком
            dataset.pointBackgroundColor = dataset.data.map((_, index) => {
                return selectedPoints.includes(index) ? 'rgba(255,0,0,1)' : dataset.borderColor;
            });
        }
    });

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

// Обработчик события для выбора графика
document.getElementById('chartSelect').addEventListener('change', (event) => {
    currentChartId = event.target.value; // Сохраняем идентификатор выбранного графика
    selectedPoints = []; // Сбросить выбранные точки
    activePoints.clear(); // Очистить активные точки
    document.getElementById('updateValues').disabled = true; // Отключить кнопку обновления
    updatePointStyles(); // Обновить стили точек
});

// Инициализация элемента для отображения сообщения
const messageElement = document.createElement('div');
messageElement.id = 'message';
document.body.appendChild(messageElement);

/*------------------------------------------------------------------*/

function handleSelectedFile(event, path) {
    const filePathElement = document.getElementById('file-path');
    filePathElement.innerText = `файл: ${path}`;

    if (archiveChart) {
        archiveChart.destroy();
        archiveChart = null;
    }

    const datasets = [];
    const formattedData = [];

    // Используем fetch для загрузки данных
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
                .on('data', row => {
                    formattedData.push({
                        time: row[Object.keys(row)[0]],
                        P_left: row['P_left'],
                        P_right: row['P_right'],
                        P_pipe: row['P_pipe'],
                        Q_left: row['Q_left'],
                        Q_right: row['Q_right'],
                        Q_pipe: row['Q_pipe'],
                        T_rec: row['T_rec'],
                        P_rec: row['P_rec'],
                        V_pipe: row['V_pipe'],
                        Qw: row['Qw'],
                        Plm: row['Plm']
                    });
                })
                .on('end', () => {
                    const time = formattedData.map(row => {
                        const parsedTime = Date.parse(row.time);
                        return isNaN(parsedTime) ? null : new Date(parsedTime).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        });
                    });

                    const addDataset = (label, dataKey, color, yAxisID) => {
                        if (formattedData.some(row => row[dataKey] !== undefined && row[dataKey] !== null)) {
                            datasets.push({
                                label: label,
                                data: formattedData.map(row => parseFloat(row[dataKey]).toFixed(2)),
                                backgroundColor: formattedData.map(() => color),
                                borderColor: color,
                                borderWidth: 1,
                                cubicInterpolationMode: 'monotone',
                                yAxisID: yAxisID,
                                color: color
                            });
                        }
                    };

                    // Добавление наборов данных
                    addDataset('ДавЛевНас', 'P_left', 'rgba(153,0,2,1)', 'P_left');
                    addDataset('ДавПравНас', 'P_right', 'rgba(255,127,126,1)', 'P_right');
                    addDataset('ДавВыход', 'P_pipe', 'rgba(254,0,0,1)', 'P_pipe');
                    addDataset('РасходЛевНас', 'Q_left', 'rgba(51,153,254,1)', 'Q_left');
                    addDataset('РасходПравНас', 'Q_right', 'rgba(152,204,254,1)', 'Q_right');
                    addDataset('РасходВыход', 'Q_pipe', 'rgba(0,0,255,1)', 'Q_pipe');
                    addDataset('ТемпРецирк', 'T_rec', 'rgba(254,215,0,1)', 'T_rec');
                    addDataset('ДавРецирк', 'P_rec', 'rgba(127,204,126,1)', 'P_rec');
                    addDataset('ОбъемВыход', 'V_pipe', 'rgba(0,0,0,1)', 'V_pipe');
                    addDataset('РасходВоды', 'Qw', 'rgba(255,102,0,1)', 'Qw');
                    addDataset('Плотность', 'Plm', 'rgba(0,153,0,1)', 'Plm');

                    // Заполнение <select> названиями графиков
                    const chartSelectElement = document.getElementById('chartSelect');
                    chartSelectElement.innerHTML = ''; // Очистить предыдущие опции

                    datasets.forEach(dataset => {
                        const option = document.createElement('option');
                        option.value = dataset.label; // Значение опции
                        option.textContent = dataset.label; // Текст опции
                        chartSelectElement.appendChild(option); // Добавление опции в select
                    });

const scales = {
    x: { 
        display: true,
        ticks: {
            display: true,
            position: 'bottom',
            length: 10,
            color: '#000'
        },
        grid: {
            display: false
        }
    }
};

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
                                },
                                grid: {
                                    display: false
                                }
                                
                            };
                        }
                    });

// Определите плагин для добавления текста
const textPlugin = {
    id: 'textPlugin',
    beforeDraw: function(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '13px Arial';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const x = chart.width - 10; // 10 пикселей от правого края
        const y = 5; // 10 пикселей от верхнего края
        ctx.fillText('Заказчик: Инвестгеосервис. Куст:56. Скв:5608. Кондуктор 245мм', x, y);
        ctx.restore();
    }
};

// Инициализация графика
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
        scales: scales,
        plugins: {
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
            },
            dragData: {
                round: 2,
                showTooltip: false,
                onDragStart: function(event, datasetIndex, index, value) {},
                onDrag: function(event, datasetIndex, index, value) {},
                onDragEnd: function(event, datasetIndex, index, value) {
                    datasets[datasetIndex].data[index] = value;
                    archiveChart.update();
                }
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
        elements: {
            point: {
                radius: 0
            }
        },
        annotation: {
            annotations: []
        }
    },
    plugins: [textPlugin]
});


                    // Обработчик клика для выделения интервала
                    enablePointSelection(); // Включаем выбор точек после инициализации графика
                });
        })
        .catch(error => console.error('Error fetching file:', error));
}

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

// Функция для включения выбора точек на графике
function enablePointSelection() {
    const canvas = document.getElementById('archive');
    canvas.addEventListener('click', pointSelectionHandler);
}

// Инициализация выбора точек после загрузки графика
function init() {
    document.getElementById('chartSelect').dispatchEvent(new Event('change')); // Инициализация при загрузке
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

