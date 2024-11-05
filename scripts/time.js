const fs = require('fs');
const path = require('path');

function generateCSV() {
    const startTime = new Date();
    startTime.setHours(18, 30, 0); // начало интервала

    const endTime = new Date();
    endTime.setHours(22, 40, 0); // Устанавливаем конец интервала

    const timeArray = [];
    let currentTime = startTime;

    while (currentTime <= endTime) {
        timeArray.push(currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        currentTime = new Date(currentTime.getTime() + 1000); // Увеличиваем на 1 секунду
    }

    const csvContent = timeArray.join('\n');
    const filePath = path.join(__dirname, 'time.csv');

    fs.writeFile(filePath, csvContent, (err) => {
        if (err) {
            console.error('Error writing CSV file:', err);
        } else {
            console.log('CSV file has been generated:', filePath);
        }
    });
}

generateCSV();