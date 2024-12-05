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

function handleOpenCsvClick() {
    ipcRenderer.send('open-file-dialog');
}

document.getElementById('csvFile').addEventListener('click', handleOpenCsvClick);
ipcRenderer.on('selected-file', handleSelectedFile);
document.getElementById('save').addEventListener('click', saveChartAsPNG);


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

let archiveChart;
let selectedPoints = [];
const activePoints = new Set();
let currentChartId = null;
let selectedFilePath = '';

/*----------------------------------------------------------------------------*/

// Обработчик клика для обновления значений точек
document.getElementById('updateValues').addEventListener('click', () => {
    const newValue1 = parseFloat(document.getElementById('value1').value);
    const newValue2 = parseFloat(document.getElementById('value2').value);

    // Проверка на количество выбранных точек
    if (selectedPoints.length !== 2) {
        alert("Выберите 2 точки для обновления значений.");
        return; 
    }

    const startIndex = Math.min(selectedPoints[0], selectedPoints[1]);
    const endIndex = Math.max(selectedPoints[0], selectedPoints[1]);

    // Генерируем случайные значения для промежуточных точек
    archiveChart.data.datasets.forEach((dataset) => {
        if (dataset.label === currentChartId) {
            for (let i = startIndex + 1; i < endIndex; i++) {
                // Генерируем случайное значение между newValue1 и newValue2
                const randomValue = Math.random() * (newValue2 - newValue1) + newValue1;
                dataset.data[i] = randomValue; // Устанавливаем случайное значение
            }
            dataset.data[startIndex] = newValue1;
            dataset.data[endIndex] = newValue2;
        }
    });

    selectedPoints = [];
    activePoints.clear();
    document.getElementById('updateValues').disabled = true;

    archiveChart.update();
    updatePointStyles();
    document.getElementById('value1').value = '';
    document.getElementById('value2').value = '';
    enablePointSelection();
});

// Функция для включения выбора точек
function enablePointSelection() {
    const archiveElement = document.getElementById('archive');
    const oldHandler = pointSelectionHandler;
    archiveElement.removeEventListener('click', oldHandler);
    archiveElement.addEventListener('click', pointSelectionHandler);
}

// Обработчик клика для выделения интервала
function pointSelectionHandler(event) {
    const points = archiveChart.getElementsAtEventForMode(event, 'nearest', {
        intersect: true
    }, true);

    if (points.length) {
        const index = points[0].index;
        const timeValue = archiveChart.data.labels[index];

        const messageElement = document.getElementById('message');
        messageElement.innerText = `ИНтервал: ${timeValue}`;

        // Добавляем или удаляем точку из выбранных
        if (activePoints.has(index)) {
            activePoints.delete(index);
        } else {
            if (activePoints.size < 2) {
                activePoints.add(index);
            } else {
                ipcRenderer.send('show-alert', "Вы можете выбрать только 2 точки.");
                activePoints.clear();
                selectedPoints = [];
                document.getElementById('updateValues').disabled = true;
            }
        }

        selectedPoints = Array.from(activePoints);
        document.getElementById('updateValues').disabled = selectedPoints.length !== 2;
        updatePointStyles(); // Обновляем стили точек
    }
}

// Функция для обновления стилей точек
function updatePointStyles() {
  //  console.log('Updating point styles for chart:', currentChartId); 
    archiveChart.data.datasets.forEach((dataset) => {
        if (dataset.label === currentChartId) {
            dataset.pointBackgroundColor = dataset.data.map((_, index) => {
                return selectedPoints.includes(index) ? 'rgba(255,0,0,1)' : dataset.borderColor;
            });
        }
    });

    archiveChart.update();

    const messageElement = document.getElementById('message');
    if (selectedPoints.length === 2) {
        const timeValues = selectedPoints.map(index => archiveChart.data.labels[index]);
        messageElement.innerText = `Интервал: ${timeValues[0]} - ${timeValues[1]}`;
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

/*-------------------------------------------------------------------------*/

// Функция для открытия диалогового окна выбора файла
function openFileDialog() {
    ipcRenderer.send('open-file-dialog');
}

// Обработка выбранного файла
ipcRenderer.on('selected-file', (event, filePath) => {
    // Запрашиваем загрузку данных из выбранного файла
    ipcRenderer.send('load-data', filePath);
});

let loadedData = "";

// Получаем данные после их загрузки
ipcRenderer.on('data-loaded', (event, rows) => {
    if (rows.length > 0) {
        const data = rows[0];

        // Заполняем поля формы
        document.getElementById('client').value = data.Client || '';
        document.getElementById('bush').value = data.Bush || '';
        document.getElementById('well').value = data.Well || '';
        document.getElementById('work').value = data.Work || '';

        loadedData = data.Data || '';

        // Обновляем clientInfo
        clientInfo = `Заказчик: ${data.Client}. Куст: ${data.Bush}. Скважина: ${data.Well}. Работа: ${data.Work}. Дата: ${loadedData}.`;

        // Обновляем график
        if (archiveChart) {
            archiveChart.update();
        }
    }
});

let clientInfo = "";
let headers = ["Client", "Bush", "Well", "Work", "Data"];
let clientDataExtracted = false;

const clientInfoPlugin = {
    id: 'clientInfoPlugin',
    beforeDraw: function(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '14px Arial';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const x = chart.width - 10;
        let y = 10;
        if (clientInfo) {
            const clientInfoArray = clientInfo.split('. ');
            const clientInfoWithValues = clientInfoArray.join(', ');
            ctx.fillText(clientInfoWithValues, x, y);
        } else {
            ctx.fillText("Нет данных о клиенте", x, y);
        }
        ctx.restore();
    }
};

document.getElementById('editForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const client = document.getElementById('client').value;
    const bush = document.getElementById('bush').value;
    const well = document.getElementById('well').value;
    const work = document.getElementById('work').value;

    const filePath = selectedFilePath;

    // Отправляем данные в основной процесс
    ipcRenderer.send('save-data', {
        filePath,
        newData: {
            client,
            bush,
            well,
            work,
            data: loadedData
        }
    });
});

function updateClientInfo(newClientInfo) {
    clientInfo = newClientInfo;
}

ipcRenderer.on('save-data-response', (event, {
    success,
    error
}) => {
    if (success) {
        alert('Данные успешно сохранены!');
        savedSuccessfully = true;

        // Получаем значения из формы
        const client = document.getElementById('client').value;
        const bush = document.getElementById('bush').value;
        const well = document.getElementById('well').value;
        const work = document.getElementById('work').value;

        // Обновляем clientInfo
        clientInfo = `Заказчик: ${client}. Куст: ${bush}. Скважина: ${well}. Работа: ${work}. Дата: ${loadedData}.`;

        if (archiveChart) {
            archiveChart.update();
        }
    } else {
        alert(`Ошибка: ${error}`);
    }
});

Chart.register(clientInfoPlugin);

/*--------------------------------------------------------------------------*/

const toggleRadiusCheckbox = document.getElementById('toggleRadius');
const hiddenDiv = document.getElementById("hidden");
const passwordModal = document.getElementById("passwordModal");
const passwordInput = document.getElementById("passwordInput");
const submitPasswordButton = document.getElementById("submitPassword");
const cancelPasswordButton = document.getElementById("cancelPassword");
const correctPassword = "123";

// Переменная для отслеживания состояния радиуса
let isRadiusVisible = false;

// Обработчик события для чекбокса
toggleRadiusCheckbox.addEventListener('change', function() {
    if (toggleRadiusCheckbox.checked) {
        passwordModal.style.display = "flex"; 
        hiddenDiv.style.display = "none"; 
    } else {
        hiddenDiv.style.display = "none"; // Скрываем div, если чекбокс не активен
        isRadiusVisible = false; // Сбрасываем состояние видимости радиуса

        // Убираем точки на графике
        if (archiveChart) {
            archiveChart.data.datasets.forEach(dataset => {
                dataset.pointRadius = 0; // Убираем радиус точек
            });
            archiveChart.update(); // Обновляем график
        }
    }
});

// Обработчик события для кнопки подтверждения
submitPasswordButton.addEventListener('click', function() {
    const userPassword = passwordInput.value; // Получаем введенный пароль

    // Проверяем, верен ли пароль
    if (userPassword === correctPassword) {
        hiddenDiv.style.display = "flex"; // Показываем div
        passwordModal.style.display = "none"; // Скрываем модальное окно

        // Переключаем состояние радиуса
        isRadiusVisible = !isRadiusVisible;

        // Изменяем радиус точек в зависимости от состояния
        const newRadius = isRadiusVisible ? 2 : 0; // Если радиус видим, радиус 2, иначе 0
        if (archiveChart) {
            archiveChart.data.datasets.forEach(dataset => {
                dataset.pointRadius = newRadius; // Измените радиус точек
            });
            archiveChart.update(); // Обновите график
        }
    } else {
        alert("Неверный пароль!"); // Сообщаем об ошибке
        passwordInput.value = ""; // Очищаем поле ввода
        toggleRadiusCheckbox.checked = false; // Сбрасываем чекбокс
    }
});

// Обработчик события для кнопки отмены
cancelPasswordButton.addEventListener('click', function() {
    passwordModal.style.display = "none"; // Скрываем модальное окно
    passwordInput.value = ""; // Очищаем поле ввода
    toggleRadiusCheckbox.checked = false; // Сбрасываем чекбокс
    hiddenDiv.style.display = "none"; // Скрываем div при отмене

    // Убираем точки на графике
    if (archiveChart) {
        archiveChart.data.datasets.forEach(dataset => {
            dataset.pointRadius = 0; // Убираем радиус точек
        });
        archiveChart.update(); // Обновляем график
    }
});


/*--------------------------------------------------------------------------*/

function handleSelectedFile(event, path) {
    const filePathElement = document.getElementById('file-path');
    filePathElement.innerText = `файл: ${path}`;

    selectedFilePath = path;

    if (archiveChart) {
        archiveChart.destroy();
        archiveChart = null;
    }

    document.getElementById('spinner').style.display = 'block';

    const saveButton = document.getElementById('save');

        if (archiveChart === null) {
        saveButton.disabled = true; 
    } else {
        saveButton.disabled = false;
    }

    const formattedData = [];
    const chartLabels = new Set();

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
                        clientInfo = `Заказчик: ${row['Client']}. Куст: ${row['Bush']}. Скважина: ${row['Well']}. Работа: ${row['Work']}. Дата: ${row['Data']}`;
                        clientDataExtracted = true;
                    } else if (row.Time) {
                        formattedData.push({
                            Time: row.Time,
                            P_left: parseFloat(row.ДавЛевНас) || null,
                            P_right: parseFloat(row.ДавПравНас) || null,
                            P_pipe: parseFloat(row.ДавВыход) || null,
                            Q_left: parseFloat(row.РасЛевНас) || null,
                            Q_right: parseFloat(row.РасПравНас) || null,
                            Q_pipe: parseFloat(row.РасВыход) || null,
                            T_rec: parseFloat(row.ТемпРец) || null,
                            P_rec: parseFloat(row.ПлотРец) || null,
                            V_pipe: parseFloat(row.ОбъемВых) || null,
                            Qw: parseFloat(row.РасВоды) || null,
                            Plm: parseFloat(row.Плотность) || null
                        });

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
                    document.getElementById('spinner').style.display = 'none';
                    const time = formattedData.map(row => {
                        const parsedTime = Date.parse(`1970-01-01T${row.Time}`);
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
                                data: formattedData.map(row => parseFloat(row[dataKey])),
                                backgroundColor: formattedData.map(() => color),
                                borderColor: color,
                                borderWidth: 1,
                                pointRadius: 0,
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

                    // Заполнение <select> названиями графиков
                    const chartSelectElement = document.getElementById('chartSelect');
                    chartSelectElement.innerHTML = '<option value="" selected>Выберите график</option>';

                    datasets.forEach(dataset => {
                        const option = document.createElement('option');
                        option.value = dataset.label; // Значение опции
                        option.textContent = dataset.label; // Текст опции
                        chartSelectElement.appendChild(option); // Добавление опции в select
                    });

                    // Устанавливаем первый график по умолчанию
                    if (datasets.length > 0) {
                        currentChartId = datasets[0].label;
                    }

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
                                    lineWidth: 0,
                                },
                            };
                        }
                    });

                    // Создание плагина для рисования красных меток
                    const lineMarkersPlugin = {
                        id: 'lineMarkers',
                        afterDraw: function(chart) {
                            const ctx = chart.ctx;
                            const xAxis = chart.scales['x'];

                            if (!xAxis) {
                                console.warn('Ось X не найдена');
                                return;
                            }

                            ctx.save();
                            ctx.strokeStyle = 'red';
                            ctx.lineWidth = 1;

                            xAxis.ticks.forEach((tick, index) => {
                                const x = Math.round(xAxis.getPixelForTick(index)); // Округляем x
                                const yBottom = Math.round(xAxis.bottom); // Начальная точка
                                const yEnd = Math.round(yBottom + 10); // Конечная точка

                                ctx.beginPath();
                                ctx.moveTo(x, yBottom);
                                ctx.lineTo(x, yEnd);
                                ctx.stroke();
                            });

                            ctx.restore();
                        }
                    };

                    // Регистрация плагина
                    Chart.register(lineMarkersPlugin);

                    archiveChart = new Chart(document.getElementById('archive').getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: time,
                            datasets: datasets.map(dataset => ({
                                ...dataset,
                                dragData: true,
                                dragX: true,
                                dragY: true,
                                tension: 1 // сглаживание
                            }))
                        },
                        options: {
                            scales: {
                                x: {
                                    grid: {
                                        display: false
                                    }
                                },
                                ...scales
                            },
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
                                            return 'Value: ' + tooltipItem.raw.toFixed(2) + ' (' + tooltipItem.dataset.label + ')';
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
                                round: 0,
                                showTooltip: false,
                                onDragStart: function(event, datasetIndex, index, value) {},
                                onDrag: function(event, datasetIndex, index, value) {},
                                onDragEnd: function(event, datasetIndex, index, value) {
                                    // Обновление значений в JSON
                                    const newValue = parseFloat(value.toFixed(2));
                                    formattedData[index][datasets[datasetIndex].dataKey] = newValue;
                                    if (archiveChart) {
                                        archiveChart.update();
                                    }
                                }
                            }
                        },
                        plugins: [
                            annotationPlugin,
                            dragDataPlugin,
                            {
                                id: 'lineMarkers',
                                afterDraw: function(chart) {
                                    const ctx = chart.ctx;
                                    const xAxis = chart.scales.x;

                                    if (!xAxis) {
                                        // console.warn('Ось X не найдена');
                                        return;
                                    }

                                    // Проходим по всем осям Y
                                    Object.keys(chart.scales).forEach(scaleId => {
                                        const yAxis = chart.scales[scaleId];
                                        if (yAxis && yAxis.isHorizontal() === false) {
                                            ctx.save();
                                            ctx.strokeStyle = 'red';
                                            ctx.lineWidth = 1;
                                            const yBottom = yAxis.bottom; // Получаем нижнюю границу оси Y

                                            // Проходим по всем меткам на оси X
                                            xAxis.ticks.forEach((tick, index) => {
                                                const x = Math.round(xAxis.getPixelForTick(index)); // Округляем x
                                                const yStart = Math.round(yBottom); // Начальная точка
                                                const yEnd = Math.round(yStart + 10); // Конечная точка

                                                ctx.beginPath();
                                                ctx.moveTo(x, yStart);
                                                ctx.lineTo(x, yEnd);
                                                ctx.stroke();
                                            });

                                            ctx.restore();
                                        }
                                    });
                                }
                            }
                        ]
                    });

                    enablePointSelection();
                    updatePointStyles();
                });
        })
        .catch(error => {
            console.error('Error fetching file:', error);
            document.getElementById('spinner').style.display = 'none';
        });
}