import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const form = document.getElementById("form");
const list = document.getElementById("attendees");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;

  await addDoc(collection(db, "people"), {
    name,
    email,
    createdAt: new Date(),
  });

  form.reset();
  loadPeople();
});

async function loadPeople() {
  list.innerHTML = "";
  const querySnapshot = await getDocs(collection(db, "people"));
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const li = document.createElement("li");
    li.textContent = `${data.name} - ${data.email}`;
    list.appendChild(li);
  });
}

loadPeople();
