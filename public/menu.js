let cart = JSON.parse(localStorage.getItem('cart')) || [];

async function loadMenu() {
  try {
    const res = await fetch('/api/products'); 
    const data = await res.json();
    
    if(data.length === 0){
      document.getElementById('menu').innerHTML = "<p>No items in DB</p>";
      return;
    }

    document.getElementById('menu').innerHTML = data.map(item => 
      `<div class="item">
        <div style="display:flex">
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
    document.getElementById('cart-count').innerText = cart.length;

  } catch (error) {
    document.getElementById('menu').innerHTML = "<p>Error: API not working</p>";
  }
}

function addToCart(name, price){
  cart.push({name, price});
  localStorage.setItem('cart', JSON.stringify(cart));
  document.getElementById('cart-count').innerText = cart.length;
  alert(name + " added to cart");
}

loadMenu();