const form = document.getElementById('ovenForm');
const KEY = 'ovenCertificationForm_v1';
function snapshot(){
  const data = {};
  for (const el of form.elements){
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
    else data[el.name] = el.value;
  }
  localStorage.setItem(KEY, JSON.stringify(data));
}
function restore(){
  try{
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const el of form.elements){
      if (!el.name || !(el.name in data)) continue;
      if (el.type === 'radio') el.checked = el.value === data[el.name];
      else el.value = data[el.name];
    }
  }catch(e){}
}
function clearForm(){
  if (!confirm('Clear all entries on this form?')) return;
  form.reset(); localStorage.removeItem(KEY);
}
form.addEventListener('input', snapshot);
form.addEventListener('change', snapshot);
restore();
