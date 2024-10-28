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

  for (const key in dataTable) {
    const row = tableBody.insertRow();
    const cell1 = row.insertCell(0); // Чекбокс
    const cell2 = row.insertCell(1); // Ключ 
    const cell3 = row.insertCell(2); // Цвет 
    const cell4 = row.insertCell(3); // Max 
    const cell5 = row.insertCell(4); // Smooth 
    const cell6 = row.insertCell(5); // Комментарий 
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'check_box';
    checkbox.checked = dataTable[key]?.active === 1; 
    cell1.appendChild(checkbox);
    checkboxes[key] = checkbox;

    checkbox.addEventListener('change', () => {
      checkboxes[key] = checkbox;  
    });
    cell2.innerText = key; 
    cell3.innerHTML = `<div style="width: 50px; height: 20px; background-color: ${dataTable[key]?.color}; margin: 0 auto; border: 1px solid #555;"></div>`;
    cell4.innerHTML = `<input type="text" value="${dataTable[key]?.max || ''}" style="width: 100%; padding: 4px;">`;
    cell5.innerHTML = `<input type="text" value="${dataTable[key]?.smooth || ''}" style="width: 100%; padding: 4px;">`;
    cell6.innerText = dataTable[key]?.comment || ''; 
  }
}

window.onload = loadJsonFile;

function getUpdatedData() {
  const updatedData = {};

  const table = document.getElementById('dataTable');
  for (let i = 1; i < table.rows.length; i++) {
    const row = table.rows[i];
    const key = row.cells[1].innerText; 
    const checkbox = checkboxes[key];

    if (checkbox) { 
        updatedData[key] = {
        active: checkbox.checked ? 1 : 0,
        color: data[key]?.color || '', 
        max: Number(row.cells[3].firstChild.value), 
        smooth: Number(row.cells[4].firstChild.value), 
        comment: row.cells[5].innerText 
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

