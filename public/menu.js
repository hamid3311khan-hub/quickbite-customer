let cart = JSON.parse(localStorage.getItem('cart')) || []; // refresh pe cart na ude isliye ye

async function loadMenu() {
  const res = await fetch('/api/products'); 
  const data = await res.json();
  document.getElementById('menu').innerHTML = data.map(item => 
    `<div class="item">
      <div style="display:flex; align-items:center">
        <img src="${item.image}">
        <div>
          <h3 style="margin:0">${item.name}</h3>
          <p style="margin:5px 0">₹${item.price}</p>
          <p style="color:green; margin:0">${item.offer}</p>
        </div>
      </div>
      <button onclick='addToCart("${item.name}", ${item.price})'>Add</button>
    </div>`
  ).join('');
  
  document.getElementById('cart-count').innerText = cart.length; // page load pe count dikhe
}

function addToCart(name, price){
  cart.push({name, price});
  localStorage.setItem('cart', JSON.stringify(cart)); // CART SAVE KAR DIYA
  document.getElementById('cart-count').innerText = cart.length;
  alert(name + " added"); // pata chale add hua
}

function goToCart(){ // YE NAYA FUNCTION
  if(cart.length === 0) return alert("Cart empty hai bhai"); // khali ho to rok de
  window.location.href = '/cart.html'; // NEXT PAGE PE BHEJ DIYA
}

loadMenu(); // YE LAST ME RAHEGA - page khulte hi menu load