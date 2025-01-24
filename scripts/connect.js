const { ipcRenderer: connectIpcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    // Пример выполнения SQL-запроса
    const query = 'SELECT client FROM chart';
    connectIpcRenderer.send('execute-query', query); 

    connectIpcRenderer.on('query-response', (event, response) => {
        if (response.error) {
            console.error('Ошибка выполнения запроса:', response.error);
        } else {
            console.log('Результаты запроса:', response.results);
        }
    });

  
    connectIpcRenderer.on('display-message', (event, message, filePath) => {
        alert(message);
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const indicator = document.getElementById('indicator');
    const icon = document.querySelector('.icon');

    // Функция для обновления цвета индикатора и иконки
    function updateIndicatorColor(isConnected) {
        if (isConnected) {
            indicator.style.background = 'radial-gradient(farthest-side at top left, #47CF73, #aceac0)';
            icon.style.color = 'white'; // Цвет иконки при подключении
        } else {
            indicator.style.background = 'radial-gradient(farthest-side at top left, #ff6347, #ffa494)';
            icon.style.color = 'white'; // Цвет иконки при отключении
        }
    }

    async function checkServerConnection() {
        try {
            const response = await fetch('https://weblabor.ru/api/receive_data');
            updateIndicatorColor(response.ok);
        } catch (error) {
            updateIndicatorColor(false);
        }
    }

    // Периодическая проверка связи с сервером
    setInterval(checkServerConnection, 3000);

    // Отправляем запрос на выполнение
    const query = 'SELECT client FROM chart';
    connectIpcRenderer.send('execute-query', query);

    // Обрабатываем ответ
    connectIpcRenderer.on('query-response', (event, response) => {
        if (response.error) {
            console.error('Ошибка выполнения запроса:', response.error);
        } else {
            console.log('Результаты запроса:', response.results);
        }
    });
});