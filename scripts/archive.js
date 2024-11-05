const {
    ipcRenderer
} = require('electron');
const Papa = require('papaparse');
const chartjs = require('chart.js');
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
let currentChartId = null; // Переменная для хранения идентификатора текущего выбранного графика

function handleOpenCsvClick() {
    ipcRenderer.send('open-file-dialog');
}

document.getElementById('csvFile').addEventListener('click', handleOpenCsvClick);
ipcRenderer.on('selected-file', handleSelectedFile);
document.getElementById('save').addEventListener('click', saveChartAsJPG);

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
        return;
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

// Функция для включения выбора точек
function enablePointSelection() {
    const archiveElement = document.getElementById('archive');
    const oldHandler = pointSelectionHandler;
    archiveElement.removeEventListener('click', oldHandler); // Удаляем предыдущий обработчик

    // Добавляем новый обработчик для выбора точек
    archiveElement.addEventListener('click', pointSelectionHandler);
}

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

        // Проверьте, включена ли точка
        if (activePoints.has(index)) {
            activePoints.delete(index); // Отменить выделение пункта
        } else {
            // Если выбраны менее 2 точек, добавить новую точку
            if (activePoints.size < 2) {
                activePoints.add(index); // Выбрать точку
            } else {
                // Если уже выбрано 2 точки, показываем предупреждение
                                ipcRenderer.send('show-alert', "Вы можете выбрать только 2 точки."); // Показать диалог
                // Сброс выделения
                activePoints.clear(); // Очистить активные точки
                selectedPoints = []; // Сбросить выбранные точки
                document.getElementById('updateValues').disabled = true; // Отключить кнопку обновления
                // Продолжить выполнение
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

    // Обновляем данные графика для изменения цвета точек только на текущем графике
    archiveChart.data.datasets.forEach((dataset, datasetIndex) => {
        if (dataset.label === currentChartId) { // Проверяем, является ли текущий набор данных выбранным графиком
            dataset.pointBackgroundColor = dataset.data.map((_, index) => {
                return selectedPoints.includes(index) ? 'rgba(255,0,0,1)' : dataset.borderColor;
            });
        }
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

            Papa.parse(data, {
                header: true,
                complete: (results) => {
                    const formattedData = results.data.map(row => ({
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
                    }));

                    const time = formattedData.map(row => {
                        const parsedTime = Date.parse(row.time);
                        return isNaN(parsedTime) ? null : new Date(parsedTime).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        });
                    });

                    const datasets = [];
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

                    // Добавьте ваши наборы данных, как вы делали ранее
                    addDataset('ДавлениеЛевНас', 'P_left', 'rgba(153,0,2,1)', 'P_left');
                    addDataset('ДавлениеПравНас', 'P_right', 'rgba(255,127,126,1)', 'P_right');
                    addDataset('Давление на выходе', 'P_pipe', 'rgba(254,0,0,1)', 'P_pipe');
                    addDataset('РасходЛевНас', 'Q_left', 'rgba(51,153,254,1)', 'Q_left');
                    addDataset('РасходПравНас', 'Q_right', 'rgba(152,204,254,1)', 'Q_right');
                    addDataset('РасВыход', 'Q_pipe', 'rgba(0,0,255,1)', 'Q_pipe');
                    addDataset('ТемпРец', 'T_rec', 'rgba(254,215,0,1)', 'T_rec');
                    addDataset('ПлотРец', 'P_rec', 'rgba(127,204,126,1)', 'P_rec');
                    addDataset('ОбъемВых', 'V_pipe', 'rgba(0,0,0,1)', 'V_pipe');
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

                    const scales = {};
                    datasets.forEach(dataset => {
                        if (dataset.yAxisID) {
                            scales[dataset.yAxisID] = {
                                display: true,
                                ticks: {
                                    display: true,
                                    position: 'left',
                                    color: dataset.color // Используем цвет из dataset
                                },
                                title: {
                                    display: false,
                                    position: 'left',
                                    text: dataset.label,
                                    color: dataset.color, // Используем цвет из dataset
                                },
                                font: {
                                    size: 18
                                },
                            };
                        }
                    });

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
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'top',
                                    labels: {
                                        fontSize: 18
                                    },
                                    align: 'left'
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
                                    onDragStart: function(event, datasetIndex, index, value) {               
                                    },
                                    onDrag: function(event, datasetIndex, index, value) {
                                    },
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
                            scales: scales,
                            elements: {
                                point: {
                                    radius: 2
                                }
                            },
                            annotation: {
                                annotations: []
                            }
                        }
                    });

                                       // Обработчик клика для выделения интервала
                    enablePointSelection();
                }
            });
        })
        .catch(error => {
            console.error('Ошибка при загрузке файла:', error);
        });
}

// Функция для сохранения графика как JPG
function saveChartAsJPG() {
    const link = document.createElement('a');
    link.href = archiveChart.toBase64Image();
    link.download = 'chart.jpg';
    link.click();
}

// Слушатель события для выбора графика
document.getElementById('chartSelect').addEventListener('change', (event) => {
    selectedPoints = []; // Сбросить выбранные точки
    activePoints.clear(); // Очистить активные точки
    document.getElementById('updateValues').disabled = true; // Отключить кнопку обновления
    updatePointStyles(); // Обновить стили точек
});

// Обработчик для закрытия приложения
ipcRenderer.on('close-app', () => {
    window.close();
});

// Обработчик для минимизации приложения
ipcRenderer.on('minimize-app', () => {
    window.minimize();
});

function saveChartAsJPG() {
    const chart = archiveChart;
    const canvas = chart.canvas;

    // Создаем временный canvas для заполнения фона
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');

    // Заполняем фон белым цветом
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Рисуем оригинальный canvas на временном canvas
    ctx.drawImage(canvas, 0, 0);

    // Получаем dataURL из временного canvas
    const dataURL = tempCanvas.toDataURL('image/jpeg', 0.9);
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'chart.jpg';
    a.click();
}