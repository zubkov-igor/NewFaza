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
    Tooltip
} = chartjs;

Chart.register([LinearScale, LineController, CategoryScale, PointElement, LineElement, Legend, Tooltip]);

const annotationPlugin = require('chartjs-plugin-annotation');
const dragDataPlugin = require('chartjs-plugin-dragdata');

let archiveChart;
let selectedPoints = [];
const activePoints = new Set();

function handleOpenCsvClick() {
    ipcRenderer.send('open-file-dialog');
}

document.getElementById('csvFile').addEventListener('click', handleOpenCsvClick);
ipcRenderer.on('selected-file', handleSelectedFile);
document.getElementById('save').addEventListener('click', saveChartAsJPG);

/*---------------------------------------------------------------------------------------------*/

// Обработчик клика для обновления значений точек
document.getElementById('updateValues').addEventListener('click', () => {
    const newValue1 = parseFloat(document.getElementById('value1').value).toFixed(2);
    const newValue2 = parseFloat(document.getElementById('value2').value).toFixed(2);

    if (selectedPoints.length === 2) {
        if (!isNaN(newValue1) && !isNaN(newValue2) && document.getElementById('value1').value !== '' && document.getElementById('value2').value !== '') {
            const startIndex = Math.min(selectedPoints[0], selectedPoints[1]);
            const endIndex = Math.max(selectedPoints[0], selectedPoints[1]);

            // Удаляем промежуточные точки
            archiveChart.data.datasets[0].data.splice(startIndex + 1, endIndex - startIndex - 1);

            // Обновляем значения выбранных точек
            archiveChart.data.datasets[0].data[startIndex] = parseFloat(newValue1); // Присваиваем новое значение
            archiveChart.data.datasets[0].data[startIndex + 1] = parseFloat(newValue2); // Присваиваем новое значение

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
        } else {
            alert("Пожалуйста, введите корректные числовые значения для обеих точек.");
        }
    }
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

        // Проверяем, выбрана ли уже точка
        if (activePoints.has(index)) {
            activePoints.delete(index); // Снимаем выделение с точки
        } else {
            // Если выбрано меньше 2 точек, добавляем новую точку
            if (activePoints.size < 2) {
                activePoints.add(index); // Выбираем точку
            } else {
                alert("Вы можете выбрать только 2 точки."); // Сообщение, если выбрано больше 2 точек
                // Сбрасываем выделение
                activePoints.clear(); // Очищаем активные точки
                selectedPoints = []; // Сбрасываем выбранные точки
                document.getElementById('updateValues').disabled = true; // Отключаем кнопку обновления
                // Не выходим из функции, продолжаем выполнение
            }
        }

        selectedPoints = Array.from(activePoints);
        document.getElementById('updateValues').disabled = selectedPoints.length !== 2;

        // Обновляем график, чтобы отобразить изменения
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
        const pointData = selectedPoints.map(index => {
            return archiveChart.data.datasets.map(dataset => {
                return `${dataset.label}: ${dataset.data[index]}`;
            }).join(', ');
        });
        messageElement.innerText = `Выбраны точки: ${pointData.join(' и ')}`;
    } else {
        messageElement.innerText = '';
    }
}

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
                                    display: true,
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

                    archiveChart = new Chart(document.getElementById('archive').getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: time,
                            datasets: datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    fontSize: 18
                                },
                                align: 'left'
                            },
                            layout: {
                                padding: {
                                    left: 0,
                                    right: 0,
                                    top: 0,
                                    bottom: 0
                                },
                                backgroundColor: 'rgba(255, 255, 255, 1)'
                            },
                            tooltips: {
                                enabled: true,
                                callbacks: {
                                    label: function(tooltipItem) {
                                        return 'Value: ' + tooltipItem.value + ' (' + tooltipItem.dataset.label + ')';
                                    }
                                }
                            },
                            scales: scales,
                            elements: {
                                point: {
                                    radius: 3
                                }
                            },
                            annotation: {
                                annotations: []
                            }
                        },
                        plugins: [annotationPlugin, dragDataPlugin]
                    });

                    // Обработчик клика для выделения интервала
                    enablePointSelection(); // Включаем выбор точек после инициализации графика
                }
            });
        })
        .catch(error => console.error('Error fetching file:', error));
}


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