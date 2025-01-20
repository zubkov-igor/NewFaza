const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();

const statusButton = document.getElementById('statusButton');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для обновления цвета кнопки
function updateButtonColor(isConnected) {
    if (isConnected) {
        statusButton.style.background = 'radial-gradient(farthest-side at top left, #47CF73, #aceac0)';
        statusButton.disabled = false;
        //statusButton.textContent = 'ON';
    } else {
        statusButton.style.background = 'radial-gradient(farthest-side at top left, #ff6347, #ffa494)';
        statusButton.disabled = true;
        //statusButton.textContent = 'Off';
    }
}

// Попытка подключения к устройству Modbus TCP
async function connectModbus() {
    try {
      //await client.connectTCP("192.168.65.5", { port: 502 });
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
        // Пробуем прочитать регистр, чтобы проверить соединение
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