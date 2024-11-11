const { ipcRenderer } = require('electron');
const fs = require('fs');

let checkboxes = {};
let data;

async function loadJsonFile() {
  try {
    data = JSON.parse(await fs.promises.readFile('settings/settings.json'));
    displayDataInTable(data);
  } catch (err) {
    console.error('Error reading JSON file:', err);
  }
}

function displayDataInTable(dataTable) {
  const tableBody = document.getElementById('dataTable').getElementsByTagName('tbody')[0];

  // Очищаем таблицу перед добавлением новых данных
  tableBody.innerHTML = '';

  for (const key in dataTable) {
    const row = tableBody.insertRow();
    const cell1 = row.insertCell(0); // checkbox
    const cell2 = row.insertCell(1); // color
    const cell3 = row.insertCell(2); // trend 
    const cell4 = row.insertCell(3); // Max 
    const cell5 = row.insertCell(4); // Smooth 
    const cell6 = row.insertCell(5); // key 

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'check_box';
    checkbox.checked = dataTable[key]?.active === 1; 
    cell1.appendChild(checkbox);
    checkboxes[key] = checkbox;

    checkbox.addEventListener('change', () => {
      checkboxes[key] = checkbox;  
    });

    cell2.innerHTML = `<div style="width: 50px; height: 20px; background-color: ${dataTable[key]?.color}; margin: 0 auto; border: 1px solid #555;"></div>`;
    cell3.innerText = dataTable[key]?.trend || ''; 
    cell4.innerHTML = `<input type="number" value="${dataTable[key]?.max || ''}">`;
    cell5.innerHTML = `<input type="number" value="${dataTable[key]?.smooth || ''}">`;
    cell6.innerText = key;
    cell6.style.display = 'none';
}
}

window.onload = loadJsonFile;

function getUpdatedData() {
  const updatedData = {};

  const table = document.getElementById('dataTable');
  for (let i = 1; i < table.rows.length; i++) {
    const row = table.rows[i];
    const key = row.cells[5].innerText; // Получаем ключ из ячейки 6
    const checkbox = checkboxes[key];

    if (checkbox) { 
      updatedData[key] = {
        active: checkbox.checked ? 1 : 0, // Состояние чекбокса
        color: data[key]?.color || '', // Цвет остается прежним, не обновляем
        max: Number(row.cells[3].firstChild.value), // Значение max
        smooth: Number(row.cells[4].firstChild.value), // Значение smooth
        trend: row.cells[2].innerText // Тренд
      };
    } else {
      console.warn(`Checkbox for key "${key}" not found.`);
    }
  }

  return updatedData;
}

document.getElementById('saveButton').addEventListener('click', () => {
  const updatedData = getUpdatedData();
  fs.writeFileSync('settings/settings.json', JSON.stringify(updatedData, null, 2));
  ipcRenderer.send('save-json', updatedData);
});

ipcRenderer.on('save-json-reply', (event, arg) => {
  const messageDiv = document.getElementById('message');
  messageDiv.innerText = arg.message;
  messageDiv.style.color = arg.success ? 'green' : 'red';
});