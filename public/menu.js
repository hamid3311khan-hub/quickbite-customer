let cart = JSON.parse(localStorage.getItem('cart')) || [];

async function loadMenu() {
  const res = await fetch('/api/products'); 
  const data = await res.json();
  document.getElementById('menu').innerHTML = data.map(item => 
    `<div class="item">
      <img src="${item.image}" width="80">
      <h3>${item.name}</h3>
      <p>₹${item.price}</p>
      <button onclick='addToCart("${item.name}", ${item.price})'>Add</button>
    </div>`
  ).join('');
  document.getElementById('cart-count').innerText = cart.length;
}

function addToCart(name, price){
  cart.push({name, price});
  localStorage.setItem('cart', JSON.stringify(cart));
  document.getElementById('cart-count').innerText = cart.length;
}

loadMenu();