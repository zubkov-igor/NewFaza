const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const ModbusRTU = require('modbus-serial');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const fastcsv = require('fast-csv');

let mainWindow;

// Prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Если приложение уже открыто, фокусируем на нем
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 1600,
            height: 850,
            icon: 'img/logo.ico',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
        });

        mainWindow.setMenu(null);
        mainWindow.loadFile('index.html');
        mainWindow.webContents.openDevTools();
    }

    app.whenReady().then(createWindow);

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    app.on('ready', () => {
        const ses = session.defaultSession;

        // Clear cache
        ses.clearCache(() => {
            console.log('Cache cleared');
        });

        // Clear cookies
        ses.clearStorageData({
            storages: ['cookies']
        }, () => {
            console.log('Cookies cleared');
        });
    });

    /*----------------------------------------------------------*/

    // Обработчик для показа диалогового окна сохранения файла
    ipcMain.handle('show-save-dialog', async () => {
        const result = await dialog.showSaveDialog({
            title: 'Сохранить CSV файл',
            defaultPath: 'chart-data.csv',
            filters: [
                { name: 'CSV Files', extensions: ['csv'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        return result.filePath; // Возвращаем путь к файлу
    });

    // Обработчик для сохранения CSV
    ipcMain.on('save-csv', (event, { filePath, csvData }) => {
        if (!filePath) {
            event.sender.send('display-message', 'Имя файла не может быть пустым', null);
            return;
        }
        fs.writeFile(filePath, csvData, 'utf8', (err) => {
            if (err) {
                event.sender.send('display-message', 'Ошибка при создании файла', null);
            } else {
                event.sender.send('display-message', 'Файл успешно сохранен', filePath);
            }
        });
    });

    ipcMain.on('show-alert', (event, message) => {
        dialog.showMessageBox({
            type: 'warning',
            buttons: ['OK'],
            title: 'NewFaza - внимание!',
            message: message
        });
    });

    ipcMain.on('open-file-dialog', async (event) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            defaultPath: '/files',
            filters: [{
                name: 'CSV Files',
                extensions: ['csv']
            }]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            event.sender.send('selected-file', result.filePaths[0]);
        }
    });

    // Открываем exe файл
    function openExeFile(filePath) {
        execFile(filePath, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing file: ${error}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
        });
    }

    ipcMain.on('open-exe-file', (event, arg) => {
        openExeFile(arg);
    });

    // Сохраняем настройки
    ipcMain.on('save-json', (event, arg) => {
        const filePath = path.join(__dirname, 'settings/settings.json');

        fs.readFile(filePath, 'utf8', (err, fileData) => {
            if (err) {
                console.error(`Ошибка при чтении файла: ${err}`);
                event.reply('save-json-reply', {
                    success: false,
                    message: `Ошибка при чтении файла: ${err}`
                });
                return;
            }

            let jsonData = JSON.parse(fileData);
            for (const key in arg) {
                if (jsonData[key]) {
                    jsonData[key].min = arg[key].min;
                    jsonData[key].max = arg[key].max;
                    jsonData[key].smooth = arg[key].smooth;
                }
            }

            fs.writeFile(filePath, JSON.stringify(jsonData, null, 4), (err) => {
                if (err) {
                    console.error(`Ошибка при сохранении файла: ${err}`);
                    event.reply('save-json-reply', {
                        success: false,
                        message: `Ошибка при сохранении файла: ${err}`
                    });
                } else {
                    console.log(`Настройки успешно обновлены`);
                    event.reply('save-json-reply', {
                        success: true,
                        message: `Настройки успешно обновлены`
                    });
                }
            });
        });
    });

ipcMain.on('save-data', (event, { filePath, newData }) => {
    // Проверяем, существует ли файл
    if (!fs.existsSync(filePath)) {
        console.error('CSV файл не найден:', filePath);
        return;
    }

    const rows = [];
    fs.createReadStream(filePath)
        .pipe(fastcsv.parse({ headers: true }))
        .on('data', (row) => {
            // Проверяем, совпадает ли Client с данными, которые мы хотим обновить
            if (row.Client === newData.client) {
                // Заменяем старые данные на новые
                rows.push({
                    Client: newData.client,
                    Bush: newData.bush,
                    Well: newData.well,
                    Work: newData.work,
                    Data: row.Data, // Сохраняем остальные поля, если они есть
                });
            } else {
                rows.push(row);
            }
        })
        .on('end', () => {
            // Записываем обновленные данные обратно в CSV
            const csvStream = fastcsv.format({ headers: true });
            const writableStream = fs.createWriteStream(filePath);

            writableStream.on('finish', () => {
                console.log('CSV файл успешно обновлен.');
            });

            csvStream.pipe(writableStream);
            rows.forEach((row) => csvStream.write(row));
            csvStream.end();
        })
        .on('error', (error) => {
            console.error('Ошибка при чтении CSV файла:', error);
        });
});
ipcMain.on('load-data', (event, filePath) => {
    const rows = [];

    fs.createReadStream(filePath)
        .pipe(fastcsv.parse({ headers: true }))
        .on('data', (row) => {
            rows.push(row);
        })
        .on('end', () => {
            // Отправляем данные обратно в рендерер
            event.sender.send('data-loaded', rows);
        })
        .on('error', (error) => {
            console.error('Ошибка при чтении CSV файла:', error);
        });
});


}
