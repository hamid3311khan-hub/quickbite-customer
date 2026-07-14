let cart = [];

async function loadMenu() {
  try {
    const res = await fetch('/api/products'); 
    const data = await res.json();
    
    if(data.length === 0){
      document.getElementById('menu').innerHTML = "<p>No items found</p>";
      return;
    }

    document.getElementById('menu').innerHTML = data.map(item => 
      `<div class="item">
        <div>
          <img src="${item.image}">
          <h3>${item.name}</h3>
          <p>₹${item.price}</p>
          <p style="color:green; font-weight:bold">${item.offer}</p>
        </div>
        <button onclick='addToCart("${item.name}", ${item.price})'>Add</button>
      </div>`
    ).join('');

  } catch (error) {
    document.getElementById('menu').innerHTML = "<p>Error loading menu</p>";
    console.log(error);