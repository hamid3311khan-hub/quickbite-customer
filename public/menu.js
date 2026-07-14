let cart = [];

async function loadMenu() {
  const res = await fetch('/api/products'); // IMPORTANT: /api/products
  const data = await res.json();
  
  document.getElementById('menu').innerHTML = data.map(item => 
    `<div class="item">
      <div>
        <img src="${item.image}">
        <h3>${item.name}</h3>
        <p>₹${item.price}</p>
        <p style="color:green">${item.offer}</p>
      </div>
      <button onclick='addToCart("${item.name}", ${item.price})'>Add</button>
    </div>`
  ).join('');
}

function addToCart(name, price){
  cart.push({name, price});
  document.getElementById('cart-count').innerText = cart.length;
  alert(name + " added to cart");
}

loadMenu();