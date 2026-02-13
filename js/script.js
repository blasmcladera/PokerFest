const form = document.getElementById('form');
const attendees = document.getElementById('attendees');

form.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  if (!name || !email) return;
  const li = document.createElement('li');
  li.textContent = `${name} — ${email}`;
  attendees.appendChild(li);
  form.reset();
});
