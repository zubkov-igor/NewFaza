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
            const response = await fetch('https://weblabor.ru/api/receive_data'); // Замените на ваш сервер
            updateIndicatorColor(response.ok); // Обновляем цвет индикатора в зависимости от состояния
        } catch (error) {
            updateIndicatorColor(false); // Если произошла ошибка, устанавливаем красный цвет
        }
    }

    // Периодическая проверка связи с сервером
    setInterval(checkServerConnection, 3000); // Проверка каждые 5 секунд
});